#!/usr/bin/env bash
# Package the Splunk Cisco App Navigator app into a Splunk .tar.gz.
# By default this script ONLY builds the package -- it does not touch
# any Splunk instance. Pass --install or --deploy (and optionally
# --restart) to push the build into a local Splunk.
#
# Version is read from the repo-root VERSION file and stamped into the
# staged/package app.conf, app.manifest, and products.conf at package time.
#
# Default workflow:
#   ./build.sh                                                # build only; produces dist/<app>-<version>.tar.gz
#
# Install workflows (splunkd-managed; goes through REST mgmt port 8089):
#   ./build.sh --install --auth admin:changeme                # build + `splunk install app` against the default Splunk
#   SPLUNK_HOME=/opt/10 ./build.sh --install --auth admin:pw  # build + install against a non-default Splunk
#   ./build.sh --install --auth admin:pw --restart            # build + install + restart Splunk
#   ./build.sh --remote-install splunk@host --ssh-port 10000
#   ./build.sh --no-build --remote-install splunk@host --ssh-port 10000 --remote-auth-user admin
#
# Deploy workflow (filesystem swap; fast for dev iteration):
#   ./build.sh --deploy                                       # rm -rf $SPLUNK_HOME/etc/apps/<app> + cp -R (preserves local/)
#   SPLUNK_HOME=/opt/10 ./build.sh --deploy --restart         # same against /opt/10, then `splunk restart`
#
# Install/deploy WITHOUT rebuilding (re-use the most recent dist/*.tar.gz).
# Handy when you've built once and want to fan the same artifact out to
# multiple local Splunk instances that each have their own admin password:
#   ./build.sh                                                                # build once
#   ./build.sh --no-build --install --auth admin:pw1                          # -> default Splunk
#   SPLUNK_HOME=/opt/10 ./build.sh --no-build --install --auth admin:pw2      # -> /opt/10
#   SPLUNK_HOME=/opt/9  ./build.sh --no-build --deploy --restart --auth a:b   # -> /opt/9 (filesystem) + restart
#
# Watch-mode workflow (keeps splunkd install, skips full webpack rebuild):
#   cd packages/splunk-cisco-app-navigator && yarn start     # terminal 1; maintains stage/
#   SPLUNK_HOME=/opt/10 ./build.sh --fast --install --auth admin:pw
#
# --install vs --deploy (mutually exclusive; mirrors ta_cisco_common/build.sh
# and field-solutions-demo-data-gen/build.sh):
#   --install: splunkd handles extraction. Auth required. Slower but
#              identical to a real Splunkbase install. local/ preserved
#              by the -update 1 contract.
#   --deploy:  filesystem swap (cp -R). NO auth required, NO mgmt port
#              touched. Restart still needed for Python/conf to take
#              effect. local/ explicitly preserved by this script.
#
# Auth can also be supplied via the splunk-CLI-native short form (`-auth`)
# or the single-arg form (`--auth=user:pass`). The legacy `SPLUNK_AUTH`
# env var is still honored for back-compat.
#
# Useful options:
#   ./build.sh --splunk-bin /some/custom/path/splunk          # override the Splunk CLI path directly
#   ./build.sh --minify                                       # slower, smaller release package
#
# Environment:
#   SPLUNK_HOME   Splunk install root. Defaults to /Applications/Splunk on
#                 macOS, /opt/splunk on Linux. The CLI is derived as
#                 $SPLUNK_HOME/bin/splunk. Examples: /opt/splunk, /opt/10.
#   SPLUNK_BIN    Full path to the Splunk CLI. Overrides the path derived
#                 from SPLUNK_HOME. Kept for back-compat.
#   SPLUNK_AUTH   Fallback auth in user:pass form, used only when --auth
#                 / -auth is not on the command line.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="splunk-cisco-app-navigator"
APP_DIR="${ROOT_DIR}/packages/${APP_NAME}"
DIST_DIR="${ROOT_DIR}/dist"
VERSION_FILE="${ROOT_DIR}/VERSION"

do_install=0
do_deploy=0
no_build=0
from_stage=0
minify=0
restart_after_install=0
verbose=0
splunk_bin_override=""
auth_override=""
auth_explicit=0
splunk_bin_explicit=0
remote_install=0
remote_target=""
remote_options_set=0
ssh_port="22"
remote_splunk_user="splunk"
remote_splunk_home="/opt/splunk"
remote_auth_user=""
remote_management_port="8089"
remote_auth_options_set=0

say() {
    [[ "$verbose" -eq 1 ]] && echo "$@" || true
}
hdr() {
    echo "$@"
}
err() {
    echo "$@" >&2
}

_NOISE_LINES=(
    'Server Certificate Hostname Validation is disabled'
)

_noise_filter() {
    if [[ ${#_NOISE_LINES[@]} -eq 0 ]]; then
        cat
        return
    fi
    local args=()
    local p
    for p in "${_NOISE_LINES[@]}"; do
        args+=(-e "$p")
    done
    grep -v -F "${args[@]}" || true
}

run_quietly() {
    local logfile rc=0
    if [[ "$verbose" -eq 1 ]]; then
        set +e
        "$@" 2>&1 | _noise_filter
        rc="${PIPESTATUS[0]}"
        set -e
        return "$rc"
    fi
    logfile="$(mktemp -t scan-build-XXXXXX.log)"
    "$@" >"$logfile" 2>&1 || rc=$?
    if [[ "$rc" -eq 0 ]]; then
        rm -f "$logfile"
        return 0
    fi
    err "ERROR: command failed: $*"
    err "---- captured output ----"
    _noise_filter <"$logfile" >&2
    err "---- end captured output ----"
    rm -f "$logfile"
    return "$rc"
}

write_remote_rest_helper() {
    local helper_path="$1"

    (
        umask 077
        cat >"$helper_path" <<'REMOTE_REST_HELPER'
#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
    echo "ERROR: expected archive, Splunk user, management port, and SPLUNK_HOME." >&2
    exit 2
fi

archive="$1"
splunk_user="$2"
management_port="$3"
splunk_home="$4"
ca_cert="${splunk_home%/}/etc/auth/cacert.pem"

if [[ ! "$archive" =~ ^/[A-Za-z0-9._/+:-]+$ ]] || [[ ! -f "$archive" ]]; then
    echo "ERROR: remote app archive is missing or unsafe." >&2
    exit 2
fi
if [[ ! "$splunk_user" =~ ^[A-Za-z0-9][A-Za-z0-9@._+-]{0,127}$ ]]; then
    echo "ERROR: Splunk username contains unsupported characters." >&2
    exit 2
fi
if [[ ! "$management_port" =~ ^[0-9]+$ ]] || (( management_port < 1 || management_port > 65535 )); then
    echo "ERROR: Splunk management port must be from 1 through 65535." >&2
    exit 2
fi
if [[ ! -r "$ca_cert" ]]; then
    echo "ERROR: Splunk CA certificate is not readable: $ca_cert" >&2
    exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR: curl is required for password-prompted remote installation." >&2
    exit 1
fi

curl_config_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//$'\t'/\\t}"
    value="${value//$'\r'/\\r}"
    value="${value//$'\n'/\\n}"
    printf '%s' "$value"
}

printf "Splunk password for user '%s': " "$splunk_user" >&2
if ! IFS= read -r -s splunk_password </dev/tty; then
    printf '\nERROR: could not read the Splunk password from the terminal.\n' >&2
    exit 1
fi
printf '\n' >&2

set +e
{
    printf 'user = "'
    curl_config_escape "$splunk_user"
    printf ':'
    curl_config_escape "$splunk_password"
    printf '"\n'
} | curl --config - \
    --fail \
    --silent \
    --show-error \
    --output /dev/null \
    --cacert "$ca_cert" \
    --resolve "SplunkServerDefaultCert:${management_port}:127.0.0.1" \
    "https://SplunkServerDefaultCert:${management_port}/services/apps/local" \
    --data 'filename=true' \
    --data-urlencode "name=${archive}" \
    --data 'update=true'
curl_status=$?
set -e

unset splunk_password
exit "$curl_status"
REMOTE_REST_HELPER
        chmod 0600 "$helper_path"
    )
}

close_remote_ssh_master() {
    local control_path="$1"
    local control_dir="$2"

    ssh -p "$ssh_port" -o BatchMode=yes -o "ControlPath=$control_path" \
        -O exit "$remote_target" >/dev/null 2>&1 || true
    rm -f "$control_path" 2>/dev/null || true
    rmdir "$control_dir" 2>/dev/null || true
}

remote_install_archive() {
    local archive="$1"
    local archive_name remote_archive remote_bundle_tmp remote_command remote_helper_local="" remote_helper_upload remote_ssh_user remote_splunk_cli remote_upload
    local control_dir control_path
    local scp_args
    local ssh_args

    if ! command -v scp >/dev/null 2>&1; then
        err "ERROR: scp is required for --remote-install."
        return 1
    fi
    if ! command -v ssh >/dev/null 2>&1; then
        err "ERROR: ssh is required for --remote-install."
        return 1
    fi

    archive_name="$(basename "$archive")"
    if [[ ! "$archive_name" =~ ^[A-Za-z0-9._+-]+$ ]]; then
        err "ERROR: archive name contains unsupported characters: $archive_name"
        return 1
    fi
    remote_ssh_user="${remote_target%%@*}"
    remote_upload="/tmp/${remote_ssh_user}-${archive_name}"
    remote_archive="${remote_splunk_home%/}/var/run/splunk/${remote_ssh_user}-${archive_name}"
    remote_bundle_tmp="${remote_splunk_home%/}/var/run/splunk/bundle_tmp"
    remote_helper_upload="/tmp/${remote_ssh_user}-${APP_NAME}-remote-install.sh"
    remote_splunk_cli="${remote_splunk_home%/}/bin/splunk"

    if [[ -n "$remote_auth_user" ]]; then
        remote_helper_local="$(mktemp "${TMPDIR:-/tmp}/${APP_NAME}-remote-install.XXXXXX")"
        write_remote_rest_helper "$remote_helper_local"
        if [[ "$remote_ssh_user" == "$remote_splunk_user" ]]; then
            remote_command="set -e; mkdir -p '$remote_bundle_tmp'; mv '$remote_upload' '$remote_archive'; chmod 0600 '$remote_archive'; bash '$remote_helper_upload' '$remote_archive' '$remote_auth_user' '$remote_management_port' '$remote_splunk_home'; rm -f '$remote_archive' '$remote_helper_upload' || true"
        else
            remote_command="set -e; chmod 0644 '$remote_upload' '$remote_helper_upload'; sudo -iu '$remote_splunk_user' mkdir -p '$remote_bundle_tmp'; sudo -iu '$remote_splunk_user' cp '$remote_upload' '$remote_archive'; sudo -iu '$remote_splunk_user' chmod 0600 '$remote_archive'; sudo -iu '$remote_splunk_user' bash '$remote_helper_upload' '$remote_archive' '$remote_auth_user' '$remote_management_port' '$remote_splunk_home'; sudo -iu '$remote_splunk_user' rm -f '$remote_archive'; rm -f '$remote_upload' '$remote_helper_upload' || true"
        fi
    elif [[ "$remote_ssh_user" == "$remote_splunk_user" ]]; then
        remote_command="set -e; mkdir -p '$remote_bundle_tmp'; mv '$remote_upload' '$remote_archive'; chmod 0600 '$remote_archive'; '$remote_splunk_cli' install app '$remote_archive' -update 1; rm -f '$remote_archive' || true"
    else
        remote_command="set -e; chmod 0644 '$remote_upload'; sudo -iu '$remote_splunk_user' mkdir -p '$remote_bundle_tmp'; sudo -iu '$remote_splunk_user' cp '$remote_upload' '$remote_archive'; sudo -iu '$remote_splunk_user' chmod 0600 '$remote_archive'; sudo -iu '$remote_splunk_user' '$remote_splunk_cli' install app '$remote_archive' -update 1; sudo -iu '$remote_splunk_user' rm -f '$remote_archive'; rm -f '$remote_upload' || true"
    fi

    control_dir="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}-ssh.XXXXXX")"
    control_path="$control_dir/cm"
    scp_args=(-P "$ssh_port" -o ControlMaster=auto -o ControlPersist=60 -o "ControlPath=$control_path")
    ssh_args=(-tt -p "$ssh_port" -o ControlMaster=auto -o ControlPersist=60 -o "ControlPath=$control_path")
    if [[ "$verbose" -ne 1 ]]; then
        scp_args+=(-q)
        ssh_args+=(-q)
    fi

    hdr "Uploading $archive_name to $remote_target:$remote_upload ..."
    if ! scp "${scp_args[@]}" "$archive" "${remote_target}:${remote_upload}"; then
        rm -f "$remote_helper_local"
        close_remote_ssh_master "$control_path" "$control_dir"
        err "ERROR: archive upload failed; the local archive is unchanged."
        return 1
    fi
    if [[ -n "$remote_auth_user" ]] && ! scp "${scp_args[@]}" "$remote_helper_local" "${remote_target}:${remote_helper_upload}"; then
        rm -f "$remote_helper_local"
        close_remote_ssh_master "$control_path" "$control_dir"
        err "ERROR: remote password helper upload failed; the local archive is unchanged."
        return 1
    fi
    rm -f "$remote_helper_local"

    if [[ "$remote_ssh_user" == "$remote_splunk_user" ]]; then
        hdr "Installing remotely as $remote_splunk_user directly (sudo not required) ..."
    else
        hdr "Installing remotely as $remote_splunk_user via sudo ..."
    fi
    if [[ -n "$remote_auth_user" ]]; then
        hdr "Authenticating to Splunk as $remote_auth_user; enter the Splunk password when prompted."
        hdr "The password is not cached or passed on the command line."
    else
        hdr "Splunk CLI authentication is separate from the remote OS account."
        hdr "At 'Splunk username:', enter a Splunk administrator (usually admin), not '$remote_splunk_user'."
    fi
    if ! ssh "${ssh_args[@]}" "$remote_target" "$remote_command"; then
        close_remote_ssh_master "$control_path" "$control_dir"
        err "ERROR: remote Splunk app installation failed."
        err "       The uploaded archive may remain on $remote_target."
        return 1
    fi
    close_remote_ssh_master "$control_path" "$control_dir"
}

if [[ -z "${SPLUNK_HOME:-}" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
        SPLUNK_HOME="/Applications/Splunk"
    else
        SPLUNK_HOME="/opt/splunk"
    fi
fi

usage() {
    cat <<EOF
Usage: ./build.sh [options]

Default behavior: build the .tar.gz only. No Splunk install, no restart.
Version is read from ./VERSION and stamped at package time.

Push-to-Splunk options (mutually exclusive):
  --install              splunkd-managed install via REST mgmt port. Calls
                         \`splunk install app dist/<app>.tar.gz -update 1
                          -auth user:pass\`. Requires --auth.
  --deploy               Filesystem swap into \$SPLUNK_HOME/etc/apps/<app>
                         (rm -rf + cp -R, preserves local/). Faster than
                         --install for dev iteration. No auth required.
  --remote-install USER@HOST
                         Upload and install on a remote Splunk host over SSH.
                         Direct OS login as splunk avoids sudo; other OS users
                         run the install as --remote-splunk-user via sudo.

Other options:
  --no-build             Skip the yarn package step and use the most
                         recent dist/<app>-*.tar.gz instead. Requires
                         --install or --deploy. Lets you fan one build
                         out to multiple Splunk instances with different
                         credentials without rebuilding each time.
  --fast, --from-stage   Package the current packages/<app>/stage directory
                         without running clean_build.sh or webpack. Designed
                         for use with a long-running 'yarn start' watcher.
                         Still creates a fresh tarball and can still use
                         --install, so splunkd remains the installer.
  --minify               Enable JavaScript minification for this clean release
                         build. Slower, but produces smaller browser bundles.
                         Not valid with --fast or --no-build.
  --auth user:pass       Splunk CLI credentials. Passed through as
                         '-auth user:pass'. Aliases: -auth, --auth=user:pass.
  --ssh-port PORT        Remote SSH port (default: 22).
  --remote-splunk-user USER
                         Remote Splunk OS account (default: splunk).
  --remote-splunk-home PATH
                         Remote Splunk root (default: /opt/splunk).
  --remote-auth-user USER
                         Prompt for this Splunk administrator password without
                         caching it or placing it on a command line.
  --remote-management-port PORT
                         Remote splunkd management port (default: 8089).
  --restart              Restart Splunk after install/deploy.
  --splunk-bin PATH      Use a specific Splunk CLI path. Overrides the
                         path derived from \$SPLUNK_HOME.
  -v, --verbose          Show full command output (yarn webpack noise,
                         tar/cp chatter, splunk CLI messages, etc.).
                         Default is quiet -- only phase headlines,
                         errors, and the final summary banner.
  -h, --help             Show this help.

Examples:
  ./build.sh                                                  # build only
  ./build.sh --install --auth admin:changeme                  # build + splunkd install
  SPLUNK_HOME=/opt/10 ./build.sh --install --auth admin:changeme --restart
  ./build.sh --deploy                                         # build + filesystem swap
  SPLUNK_HOME=/opt/10 ./build.sh --deploy --restart           # ... against /opt/10 + restart
  ./build.sh --minify                                         # minified release package
  ./build.sh --minify --install --auth admin:********          # minify + install
  ./build.sh --no-build --remote-install splunk@host --ssh-port 10000 --remote-auth-user admin

  # Build once, install to multiple instances:
  ./build.sh
  ./build.sh --no-build --install --auth admin:pw1
  SPLUNK_HOME=/opt/10 ./build.sh --no-build --install --auth admin:pw2

  # Keep webpack watch running, then package current stage/ and install via splunkd:
  cd packages/splunk-cisco-app-navigator && yarn start
  SPLUNK_HOME=/opt/10 ./build.sh --fast --install --auth admin:pw
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --install)
            do_install=1
            shift
            ;;
        --deploy)
            do_deploy=1
            shift
            ;;
        --remote-install)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --remote-install requires user@host." >&2
                exit 2
            fi
            remote_install=1
            remote_target="$2"
            shift 2
            ;;
        --remote-install=*)
            remote_install=1
            remote_target="${1#--remote-install=}"
            shift
            ;;
        --ssh-port)
            if [[ $# -lt 2 ]]; then echo "ERROR: --ssh-port requires a port." >&2; exit 2; fi
            remote_options_set=1; ssh_port="$2"; shift 2
            ;;
        --ssh-port=*) remote_options_set=1; ssh_port="${1#--ssh-port=}"; shift ;;
        --remote-splunk-user)
            if [[ $# -lt 2 ]]; then echo "ERROR: --remote-splunk-user requires an OS user." >&2; exit 2; fi
            remote_options_set=1; remote_splunk_user="$2"; shift 2
            ;;
        --remote-splunk-user=*) remote_options_set=1; remote_splunk_user="${1#--remote-splunk-user=}"; shift ;;
        --remote-splunk-home)
            if [[ $# -lt 2 ]]; then echo "ERROR: --remote-splunk-home requires an absolute path." >&2; exit 2; fi
            remote_options_set=1; remote_splunk_home="$2"; shift 2
            ;;
        --remote-splunk-home=*) remote_options_set=1; remote_splunk_home="${1#--remote-splunk-home=}"; shift ;;
        --remote-auth-user)
            if [[ $# -lt 2 ]]; then echo "ERROR: --remote-auth-user requires a Splunk username." >&2; exit 2; fi
            remote_options_set=1; remote_auth_options_set=1; remote_auth_user="$2"; shift 2
            ;;
        --remote-auth-user=*) remote_options_set=1; remote_auth_options_set=1; remote_auth_user="${1#--remote-auth-user=}"; shift ;;
        --remote-management-port)
            if [[ $# -lt 2 ]]; then echo "ERROR: --remote-management-port requires a port." >&2; exit 2; fi
            remote_options_set=1; remote_auth_options_set=1; remote_management_port="$2"; shift 2
            ;;
        --remote-management-port=*) remote_options_set=1; remote_auth_options_set=1; remote_management_port="${1#--remote-management-port=}"; shift ;;
        --no-build|--skip-build)
            no_build=1
            shift
            ;;
        --fast|--from-stage|--stage)
            from_stage=1
            shift
            ;;
        --minify)
            minify=1
            shift
            ;;
        -v|--verbose)
            verbose=1
            shift
            ;;
        --restart)
            restart_after_install=1
            shift
            ;;
        --auth|-auth)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: $1 requires a value (user:pass)" >&2
                exit 2
            fi
            auth_override="$2"
            auth_explicit=1
            shift 2
            ;;
        --auth=*)
            auth_override="${1#--auth=}"
            auth_explicit=1
            shift
            ;;
        --splunk-bin)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --splunk-bin requires a path." >&2
                exit 2
            fi
            splunk_bin_override="$2"
            splunk_bin_explicit=1
            shift 2
            ;;
        --splunk-bin=*)
            splunk_bin_override="${1#--splunk-bin=}"
            splunk_bin_explicit=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

# Ask webpack for live phase/percentage updates only in verbose mode. Quiet
# builds still capture output and print it in full if the command fails.
if [[ "$verbose" -eq 1 ]]; then
    export SCAN_WEBPACK_PROGRESS=1
fi

auth_value="${auth_override:-${SPLUNK_AUTH:-}}"

if [[ -n "$splunk_bin_override" ]]; then
    SPLUNK_BIN="$splunk_bin_override"
else
    SPLUNK_BIN="${SPLUNK_BIN:-${SPLUNK_HOME}/bin/splunk}"
fi

action_count=$((do_install + do_deploy + remote_install))
if (( action_count > 1 )); then
    echo "ERROR: --install, --deploy, and --remote-install are mutually exclusive." >&2
    echo "       --install pushes via splunkd REST (slower, mgmt-port auth)." >&2
    echo "       --deploy  swaps the filesystem under \$SPLUNK_HOME/etc/apps/ (fast)." >&2
    exit 2
fi

if [[ "$remote_install" -eq 1 && "$auth_explicit" -eq 1 ]]; then
    echo "ERROR: --auth is not accepted with --remote-install." >&2
    echo "       Use --remote-auth-user for a password prompt without a cached CLI session." >&2
    exit 2
fi
if [[ "$remote_install" -eq 1 && "$splunk_bin_explicit" -eq 1 ]]; then
    echo "ERROR: --splunk-bin is local-only; use --remote-splunk-home." >&2
    exit 2
fi
if [[ "$remote_install" -eq 0 && "$remote_options_set" -eq 1 ]]; then
    echo "ERROR: remote SSH options require --remote-install user@host." >&2
    exit 2
fi
if [[ "$remote_install" -eq 1 && "$remote_auth_options_set" -eq 1 && -z "$remote_auth_user" ]]; then
    echo "ERROR: --remote-management-port requires --remote-auth-user." >&2
    exit 2
fi
if [[ "$remote_install" -eq 1 ]]; then
    if [[ ! "$remote_target" =~ ^[A-Za-z_][A-Za-z0-9_-]*@([A-Za-z0-9._-]+|\[[0-9A-Fa-f:]+\])$ ]]; then
        echo "ERROR: --remote-install target must use a safe user@host form; got '$remote_target'." >&2
        exit 2
    fi
    if [[ ! "$ssh_port" =~ ^[0-9]+$ ]] || (( ssh_port < 1 || ssh_port > 65535 )); then
        echo "ERROR: --ssh-port must be from 1 through 65535." >&2
        exit 2
    fi
    if [[ -n "$remote_auth_user" && ! "$remote_auth_user" =~ ^[A-Za-z0-9][A-Za-z0-9@._+-]{0,127}$ ]]; then
        echo "ERROR: --remote-auth-user contains unsupported characters." >&2
        exit 2
    fi
    if [[ ! "$remote_management_port" =~ ^[0-9]+$ ]] || (( remote_management_port < 1 || remote_management_port > 65535 )); then
        echo "ERROR: --remote-management-port must be from 1 through 65535." >&2
        exit 2
    fi
    if [[ ! "$remote_splunk_user" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]]; then
        echo "ERROR: --remote-splunk-user must be a valid OS user name." >&2
        exit 2
    fi
    if [[ ! "$remote_splunk_home" =~ ^/[A-Za-z0-9._/-]+$ ]] || [[ "$remote_splunk_home" == "/" ]] || [[ "/$remote_splunk_home/" == *"/../"* ]]; then
        echo "ERROR: --remote-splunk-home must be a safe absolute path." >&2
        exit 2
    fi
fi

if [[ "$restart_after_install" -eq 1 && "$do_install" -eq 0 && "$do_deploy" -eq 0 && "$remote_install" -eq 0 ]]; then
    do_install=1
fi

if [[ "$restart_after_install" -eq 1 && "$remote_install" -eq 1 ]]; then
    echo "ERROR: --restart is not supported with --remote-install." >&2
    exit 2
fi

if [[ "$no_build" -eq 1 && "$do_install" -eq 0 && "$do_deploy" -eq 0 && "$remote_install" -eq 0 ]]; then
    echo "ERROR: --no-build requires --install, --deploy, or --remote-install." >&2
    echo "       Use it to reuse an existing dist/<app>-*.tar.gz on another" >&2
    echo "       Splunk instance, e.g.:" >&2
    echo "         SPLUNK_HOME=/opt/10 ./build.sh --no-build --install --auth admin:pw" >&2
    exit 2
fi

if [[ "$from_stage" -eq 1 && "$no_build" -eq 1 ]]; then
    echo "ERROR: --from-stage and --no-build are mutually exclusive." >&2
    echo "       --from-stage creates a fresh tarball from stage/." >&2
    echo "       --no-build reuses the newest tarball already in dist/." >&2
    exit 2
fi

# Minification changes webpack output, so it cannot be applied to a stage/
# directory or tarball that was already built.
if [[ "$minify" -eq 1 && "$from_stage" -eq 1 ]]; then
    echo "ERROR: --minify and --from-stage are mutually exclusive." >&2
    echo "       --minify requires a clean webpack build; --from-stage reuses existing output." >&2
    exit 2
fi
if [[ "$minify" -eq 1 && "$no_build" -eq 1 ]]; then
    echo "ERROR: --minify and --no-build are mutually exclusive." >&2
    echo "       --minify requires a clean webpack build; --no-build reuses an existing tarball." >&2
    exit 2
fi

if [[ "$do_install" -eq 1 ]]; then
    if [[ -z "$auth_value" ]]; then
        echo "ERROR: --install requires --auth user:pass" >&2
        echo "       Example: ./build.sh --install --auth admin:changeme" >&2
        echo "       (or set SPLUNK_AUTH=admin:changeme in the environment)" >&2
        exit 2
    fi
    if [[ "$auth_value" != *:* ]]; then
        echo "ERROR: auth value must be in 'user:pass' format (no colon found)" >&2
        exit 2
    fi
fi

if [[ "$do_deploy" -eq 1 ]]; then
    if [[ ! -d "${SPLUNK_HOME}/etc/apps" ]]; then
        echo "ERROR: --deploy needs \$SPLUNK_HOME/etc/apps to exist." >&2
        echo "       SPLUNK_HOME is currently '${SPLUNK_HOME}'." >&2
        echo "       Examples:" >&2
        echo "         SPLUNK_HOME=/opt/splunk ./build.sh --deploy" >&2
        echo "         SPLUNK_HOME=/opt/10     ./build.sh --deploy" >&2
        exit 1
    fi
    if [[ "$restart_after_install" -eq 1 && -z "$auth_value" ]]; then
        echo "ERROR: --deploy --restart requires --auth user:pass (Splunk CLI restart)." >&2
        exit 2
    fi
fi

build_version=""
if [[ "$no_build" -eq 0 ]]; then
    if [[ ! -f "$VERSION_FILE" ]]; then
        err "ERROR: VERSION file not found: ${VERSION_FILE}"
        exit 1
    fi
    build_version="$(tr -d '[:space:]' < "$VERSION_FILE")"
    if [[ -z "$build_version" ]]; then
        err "ERROR: VERSION file is empty: ${VERSION_FILE}"
        exit 1
    fi
fi

if [[ "$no_build" -eq 1 ]]; then
    hdr "Reusing existing tarball (--no-build)..."
elif [[ "$from_stage" -eq 1 ]]; then
    hdr "Packaging current stage/ v${build_version} (--from-stage)..."
    run_quietly bash "${APP_DIR}/bin/package_app.sh" --from-stage
else
    if [[ "$minify" -eq 1 ]]; then
        hdr "Packaging ${APP_NAME} v${build_version} (minified release build)..."
        run_quietly bash -c "cd '$APP_DIR' && yarn run package:app --minify"
    else
        hdr "Packaging ${APP_NAME} v${build_version}..."
        run_quietly bash -c "cd '$APP_DIR' && yarn run package:app"
    fi
fi

if [[ "$no_build" -eq 1 ]]; then
    package_path="$(
        find "$DIST_DIR" -maxdepth 1 -type f -name "${APP_NAME}-*.tar.gz" \
            -print0 \
            | xargs -0 ls -t 2>/dev/null \
            | head -n 1
    )"
else
    package_path="${DIST_DIR}/${APP_NAME}-${build_version}.tar.gz"
fi

if [[ -z "$package_path" ]]; then
    if [[ "$no_build" -eq 1 ]]; then
        err "ERROR: --no-build requested but no ${APP_NAME}-*.tar.gz found under ${DIST_DIR}."
        err "       Run ./build.sh once (without --no-build) to produce a package first."
    else
        err "ERROR: Could not find ${APP_NAME}-*.tar.gz under ${DIST_DIR}."
    fi
    exit 1
fi

package_build="$(
    tar -xzOf "$package_path" "${APP_NAME}/default/app.conf" 2>/dev/null \
        | grep -E '^[[:space:]]*build[[:space:]]*=' \
        | head -1 \
        | sed -E 's/.*=[[:space:]]*//' \
        | tr -d '[:space:]'
)"

if [[ "$no_build" -eq 1 ]]; then
    say "[build] Reusing: ${package_path} ([install] build = ${package_build:-unknown})"
else
    say "[build] Package ready: ${package_path}"
fi

if [[ "$do_install" -eq 1 ]]; then
    if [[ ! -x "$SPLUNK_BIN" ]]; then
        err "ERROR: Splunk CLI not found or not executable: ${SPLUNK_BIN}"
        err "       Either SPLUNK_HOME is wrong (currently: ${SPLUNK_HOME}) or"
        err "       Splunk isn't installed there. The tarball at"
        err "       ${package_path} is unaffected; install it manually if needed."
        err ""
        err "       Examples:"
        err "         SPLUNK_HOME=/opt/splunk ./build.sh --install --auth user:pass"
        err "         SPLUNK_HOME=/opt/10     ./build.sh --install --auth user:pass"
        exit 1
    fi

    hdr "Installing into ${SPLUNK_HOME} ..."
    run_quietly "$SPLUNK_BIN" install app "$package_path" -update 1 -auth "$auth_value"
fi

if [[ "$remote_install" -eq 1 ]]; then
    remote_install_archive "$package_path"
fi

if [[ "$do_deploy" -eq 1 ]]; then
    APPS_DIR="${SPLUNK_HOME}/etc/apps"
    TARGET="${APPS_DIR}/${APP_NAME}"
    LOCAL_BACKUP=""
    hdr "Deploying to ${TARGET} ..."
    if [[ -d "${TARGET}/local" ]]; then
        LOCAL_BACKUP="$(mktemp -d)"
        say "[build] Preserving ${TARGET}/local in ${LOCAL_BACKUP} during swap..."
        cp -R "${TARGET}/local" "${LOCAL_BACKUP}/local"
    fi

    UNPACK_DIR="$(mktemp -d)"
    trap "rm -rf '${UNPACK_DIR}' '${LOCAL_BACKUP}'" EXIT

    say "[build] Extracting ${package_path} -> ${UNPACK_DIR} ..."
    run_quietly tar xzf "$package_path" -C "$UNPACK_DIR"
    if [[ ! -d "${UNPACK_DIR}/${APP_NAME}" ]]; then
        err "ERROR: tarball did not contain expected top-level dir '${APP_NAME}'."
        exit 1
    fi

    say "[build] Swapping ${TARGET} ..."
    rm -rf "$TARGET"
    cp -R "${UNPACK_DIR}/${APP_NAME}" "$TARGET"

    if [[ -n "$LOCAL_BACKUP" ]]; then
        say "[build] Restoring local/ ..."
        cp -R "${LOCAL_BACKUP}/local" "${TARGET}/local"
    fi
fi

if [[ "$restart_after_install" -eq 1 ]]; then
    if [[ ! -x "$SPLUNK_BIN" ]]; then
        err "ERROR: Splunk CLI not found, cannot --restart: ${SPLUNK_BIN}"
        exit 1
    fi
    hdr "Restarting Splunk..."
    run_quietly "$SPLUNK_BIN" restart -auth "$auth_value"
fi

pkg_app_conf="$(tar -xzOf "$package_path" "${APP_NAME}/default/app.conf" 2>/dev/null || true)"
PKG_VERSION="$(printf '%s\n' "$pkg_app_conf" | awk -F= '
    /^\[/ { in_id = ($0 == "[id]") ? 1 : 0; next }
    in_id && /^[[:space:]]*version[[:space:]]*=/ {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit
    }
')"
PKG_BUILD="$(printf '%s\n' "$pkg_app_conf" | awk -F= '
    /^\[/ { in_install = ($0 == "[install]") ? 1 : 0; next }
    in_install && /^[[:space:]]*build[[:space:]]*=/ {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit
    }
')"

if [[ "$remote_install" -eq 1 ]]; then
    if [[ "${remote_target%%@*}" == "$remote_splunk_user" ]]; then
        mode_label="installed remotely as ${remote_splunk_user} -> ${remote_target}:${remote_splunk_home%/}/etc/apps/${APP_NAME}"
    else
        mode_label="installed remotely via sudo -iu ${remote_splunk_user} -> ${remote_target}:${remote_splunk_home%/}/etc/apps/${APP_NAME}"
    fi
elif [[ "$do_install" -eq 1 ]]; then
    mode_label="installed via splunkd -> ${SPLUNK_HOME}/etc/apps/${APP_NAME}"
elif [[ "$do_deploy" -eq 1 ]]; then
    mode_label="deployed (filesystem swap) -> ${SPLUNK_HOME}/etc/apps/${APP_NAME}"
else
    mode_label="build only (no install / no deploy)"
fi
if [[ "$no_build" -eq 1 ]]; then
    mode_label="--no-build (reused dist/) + ${mode_label}"
fi
if [[ "$from_stage" -eq 1 ]]; then
    mode_label="--from-stage (packaged existing stage/) + ${mode_label}"
fi
if [[ "$minify" -eq 1 ]]; then
    mode_label="minified release build + ${mode_label}"
fi

echo ""
echo "================================================================"
COMPLETED_AT="$(date '+%Y-%m-%d %I:%M:%S %p %Z (%z)')"
echo "  Done: ${APP_NAME} v${PKG_VERSION:-unknown} (build ${PKG_BUILD:-unknown}) at ${COMPLETED_AT}"
echo "================================================================"
echo "  Mode:    ${mode_label}"
echo "  Tarball: ${package_path}"
