"""Reserve one repository-wide build number using a GitHub workflow run.

The offset and workflow filename are permanent sequence identities. Never reset
them or use a fork's counter. Numbers are spent when a run is created, even if
the runner or the later local build fails.
"""

import argparse
import configparser
import contextlib
import fcntl
import os
import re
import tarfile
import tempfile
import json
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path


REPOSITORY = "splunk/splunk-cisco-app-navigator"
WORKFLOW = "reserve-build-number.yml"
OFFSET = 99
PREFIX = "Reserve Navigator build v1 "
APP_ID = "splunk-cisco-app-navigator"
MANUAL_ENV = "NAVIGATOR_BUILD_NUMBER"
MAX_CATCHUP = 8


class ReservationError(RuntimeError):
    pass


class BelowFloor(ReservationError):
    pass


def github(method, endpoint, payload=None):
    command = ["gh", "api", "--hostname", "github.com", "--method", method,
               f"repos/{REPOSITORY}/{endpoint}".rstrip("/")]
    if payload is not None:
        command += ["--input", "-"]
    try:
        result = subprocess.run(command, input=json.dumps(payload) if payload else None,
                                capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReservationError("GitHub request failed or timed out; no local number was assigned.") from error
    if result.returncode:
        # gh stderr can contain account/network details. Do not echo it.
        raise ReservationError(
            "Cannot reserve a build number on github.com/splunk/splunk-cisco-app-navigator. "
            "Check gh authentication, Actions write access, connectivity, and that "
            "reserve-build-number.yml is active on the default branch. Use a coordinated manual number if shared allocation remains unavailable."
        )
    try:
        data = json.loads(result.stdout) if result.stdout.strip() else None
        if data is not None and not isinstance(data, dict):
            raise ValueError("expected an object")
        return data
    except ValueError as error:
        raise ReservationError("GitHub returned invalid reservation metadata.") from error


def reserve_build(local_floor, receipt_dir):
    if not shutil.which("gh"):
        raise ReservationError("GitHub CLI is required: brew install gh; then gh auth login --hostname github.com.")
    repository = github("GET", "")
    workflow = github("GET", f"actions/workflows/{WORKFLOW}")
    if (not isinstance(repository, dict) or not isinstance(workflow, dict)
            or str(repository.get("full_name", "")).lower() != REPOSITORY.lower()
            or not isinstance(repository.get("default_branch"), str)
            or not repository.get("default_branch")
            or type(workflow.get("id")) is not int
            or workflow.get("path") != f".github/workflows/{WORKFLOW}"
            or workflow.get("state") != "active"):
        raise ReservationError("The canonical build-number workflow is unavailable or inactive.")
    request_id = uuid.uuid4().hex
    title = PREFIX + request_id
    print("Reserving a shared build number on GitHub ...", file=sys.stderr)
    # Submit exactly once. A lost response may still have spent a number.
    github("POST", f"actions/workflows/{WORKFLOW}/dispatches",
           {"ref": repository["default_branch"], "inputs": {"request_id": request_id}})
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        matches = []
        # Bounded pagination tolerates many simultaneous developers. An unseen
        # reservation fails closed rather than submitting a duplicate request.
        for page in range(1, 6):
            data = github("GET", f"actions/workflows/{WORKFLOW}/runs?event=workflow_dispatch&per_page=100&page={page}")
            runs = data.get("workflow_runs") if isinstance(data, dict) else None
            if not isinstance(runs, list) or any(not isinstance(run, dict) for run in runs):
                raise ReservationError("Invalid build reservation list from GitHub.")
            matches.extend(run for run in runs if run.get("display_title") == title)
            if len(runs) < 100 or matches:
                break
        if matches:
            if len(matches) != 1:
                raise ReservationError("Ambiguous build reservation; no number will be reused.")
            run = matches[0]
            sequence = run.get("run_number")
            if (run.get("workflow_id") != workflow.get("id")
                    or run.get("event") != "workflow_dispatch"
                    or type(sequence) is not int or sequence < 1
                    or type(run.get("id")) is not int):
                raise ReservationError("Invalid build reservation identity.")
            number = OFFSET + sequence
            url = f"https://github.com/{REPOSITORY}/actions/runs/{run['id']}"
            receipt = {"build": number, "request_id": request_id,
                       "backend": "workflow-v1", "repository": REPOSITORY,
                       "usable": number > local_floor, "claimed": False,
                       "high_water_mark": max(number, local_floor),
                       "workflow_id": workflow["id"], "run_id": run["id"],
                       "run_number": sequence, "url": url}
            save_current(receipt_dir, receipt)
            if number <= local_floor:
                raise BelowFloor(
                    f"Reserved build {number} is not above existing build {local_floor}. "
                    "The number is spent; retry or coordinate a manual number above the known floor."
                )
            print(f"Reserved build {number}: {url}", file=sys.stderr)
            return number
        time.sleep(2)
    raise ReservationError(f"Reservation {request_id} was not visible within 120 seconds; retry as a new build. Numbers may be skipped.")


def _load(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def legacy_receipts(receipt_dir):
    """Recognize our old receipt format, not arbitrary numbered JSON files."""
    for path in receipt_dir.glob("*"):
        match = re.fullmatch(r"([0-9]+)\.(json|claimed)", path.name)
        if not match or not path.is_file() or path.is_symlink():
            continue
        data = _load(path)
        sequence = data.get("run_number")
        if (type(sequence) is int and sequence > 0
                and type(data.get("build")) is int
                and data["build"] == int(match[1]) == OFFSET + sequence
                and type(data.get("workflow_id")) is int
                and type(data.get("run_id")) is int
                and re.fullmatch(r"[0-9a-f]{32}", str(data.get("request_id", "")))):
            yield path, data


@contextlib.contextmanager
def state_lock(receipt_dir):
    # Lock the directory, not current.json: replacing the file changes its inode.
    # Package compilation/staging still requires one build per workspace.
    receipt_dir.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(receipt_dir, os.O_RDONLY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        os.close(descriptor)
        raise ReservationError("Another local reservation/claim is running; use one build per workspace.") from error
    try:
        yield
    finally:
        os.close(descriptor)


def save_current(receipt_dir, receipt):
    receipt_dir.mkdir(parents=True, exist_ok=True)
    receipt = {**receipt, "high_water_mark": max(local_state_floor(receipt_dir),
                 receipt.get("high_water_mark", 0), receipt.get("build", 0))}
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=receipt_dir,
                                         prefix=".current-", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(receipt, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, receipt_dir / "current.json")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    for path, _data in list(legacy_receipts(receipt_dir)):
        path.unlink()
    # Interrupted atomic writes are task-owned; preserve their high-water mark
    # in local_state_floor before replacing the current record.
    for path in receipt_dir.glob(".current-*"):
        if re.fullmatch(r"\.current-[a-z0-9_]{8}", path.name) and path.is_file() and not path.is_symlink():
            path.unlink()


def local_state_floor(receipt_dir):
    candidates = [receipt_dir / "current.json"] + [
        p for p in receipt_dir.glob(".current-*") if re.fullmatch(r"\.current-[a-z0-9_]{8}", p.name)]
    values = [OFFSET]
    for path in candidates:
        data = _load(path)
        for key in ("build", "high_water_mark"):
            if type(data.get(key)) is int and data[key] >= 0:
                values.append(data[key])
    values.extend(data["build"] for _path, data in legacy_receipts(receipt_dir))
    return max(values)


def claim_build(number, receipt_dir):
    """Consume the current reservation once before a package attempt."""
    with state_lock(receipt_dir):
        receipt = _load(receipt_dir / "current.json")
        valid = (receipt.get("repository") == REPOSITORY
                 and type(receipt.get("build")) is int
                 and receipt["build"] == number > OFFSET
                 and receipt.get("usable") is True
                 and re.fullmatch(r"[0-9a-f]{32}", str(receipt.get("request_id", ""))))
        if receipt.get("backend") == "workflow-v1":
            sequence = receipt.get("run_number")
            valid = valid and (type(sequence) is int and number == OFFSET + sequence
                               and type(receipt.get("run_id")) is int
                               and type(receipt.get("workflow_id")) is int)
        elif receipt.get("backend") != "manual":
            valid = False
        if not valid:
            raise ReservationError("Missing or invalid current reservation; reserve a fresh number.")
        if receipt.get("claimed") is not False:
            raise ReservationError("This build reservation was already used; reserve another number.")
        receipt["claimed"] = True
        save_current(receipt_dir, receipt)


def shared_floor():
    """Best-effort read for manual overrides; never dispatches a reservation."""
    data = github("GET", f"actions/workflows/{WORKFLOW}/runs?per_page=100&page=1")
    runs = data.get("workflow_runs") if isinstance(data, dict) else None
    if not isinstance(runs, list) or any(not isinstance(r, dict) or type(r.get("run_number")) is not int or r["run_number"] < 1 for r in runs):
        raise ReservationError("Cannot read shared build history.")
    return max([OFFSET] + [OFFSET + r["run_number"] for r in runs])


def manual_reservation(floor, receipt_dir, reason):
    raw = os.environ.get(MANUAL_ENV)
    message = (f"Shared allocation unavailable or bypassed: {reason}. "
               f"Enter a coordinated build number greater than {floor}. "
               "Global uniqueness cannot be verified offline; coordinate with other developers: ")
    print("WARNING: " + message, file=sys.stderr)
    if raw is None:
        try:
            # build.sh and shell command substitution capture stdout/stderr.
            # The controlling terminal keeps both the warning and input visible.
            if not sys.stdin.isatty() or os.environ.get("CI", "").lower() not in {"", "0", "false"}:
                raise OSError("unattended CI")
            with open("/dev/tty", "w") as terminal, open("/dev/tty", "r") as response:
                terminal.write(message)
                terminal.flush()
                raw = response.readline().strip()
        except (OSError, EOFError) as error:
            raise ReservationError(
                f"No interactive terminal. Set {MANUAL_ENV} to a coordinated integer greater than {floor} and retry.") from error
    if not re.fullmatch(r"[0-9]+", raw) or int(raw) <= floor:
        raise ReservationError(f"{MANUAL_ENV} must be an integer greater than {floor}.")
    number = int(raw)
    save_current(receipt_dir, {"build": number, "repository": REPOSITORY,
                              "backend": "manual", "usable": True, "claimed": False,
                              "request_id": uuid.uuid4().hex, "reason": reason})
    print(f"WARNING: Manually reserved build {number}; global uniqueness is unverified. Coordinate with other developers.", file=sys.stderr)
    return number


def reserve_resilient(floor, receipt_dir):
    with state_lock(receipt_dir):
        floor = max(floor, local_state_floor(receipt_dir), OFFSET)
        if MANUAL_ENV in os.environ:
            try:
                floor = max(floor, shared_floor())
            except ReservationError:
                pass
            return manual_reservation(floor, receipt_dir, f"explicit {MANUAL_ENV} override")
        try:
            # Bound catch-up when an installed/archive/manual number is ahead.
            # Each attempt is a real spent server reservation, never a guessed increment.
            for _attempt in range(MAX_CATCHUP):
                try:
                    return reserve_build(floor, receipt_dir)
                except BelowFloor:
                    pass
            raise ReservationError("Shared counter is below the known floor after bounded catch-up.")
        except ReservationError as error:
            floor = max(floor, local_state_floor(receipt_dir))
            try:
                floor = max(floor, shared_floor())
            except ReservationError:
                pass
            return manual_reservation(floor, receipt_dir, str(error))


def _read_build(content, source):
    parser = configparser.ConfigParser(interpolation=None)
    try:
        parser.read_string(content)
        raw = parser.get("install", "build", fallback="").strip()
    except configparser.Error as error:
        raise ReservationError(f"Cannot read build metadata from {source}.") from error
    if not re.fullmatch(r"[0-9]+", raw):
        raise ReservationError(f"Invalid [install] build metadata in {source}.")
    return int(raw)


def local_floor(app_conf, floor_file, dist_dir, app_id, target_app_conf=None):
    values = [OFFSET]
    if app_conf.is_file():
        values.append(_read_build(app_conf.read_text(encoding="utf-8"), app_conf))
    if floor_file.is_file():
        raw = floor_file.read_text(encoding="utf-8").strip()
        if not re.fullmatch(r"[0-9]+", raw):
            raise ReservationError(f"Invalid historical build floor in {floor_file}.")
        values.append(int(raw))
    # Read archive metadata rather than guessing from a filename. Suffixes such
    # as -minified.tar.gz or .tgz retain their actual build identity.
    for path in sorted(set(dist_dir.glob(f"{app_id}-*.tar.gz")) | set(dist_dir.glob(f"{app_id}-*.tgz"))):
        try:
            with tarfile.open(path, "r:*") as archive:
                member = archive.getmember(f"{app_id}/default/app.conf")
                if not member.isfile() or member.size > 1024 * 1024:
                    raise ReservationError(f"Non-regular or oversized build metadata in {path}.")
                with archive.extractfile(member) as handle:
                    values.append(_read_build(handle.read().decode("utf-8"), path))
        except (OSError, tarfile.TarError, KeyError, UnicodeError) as error:
            raise ReservationError(f"Cannot establish build floor from archive {path}.") from error
    if target_app_conf is not None and target_app_conf.is_file():
        values.append(_read_build(target_app_conf.read_text(encoding="utf-8"), target_app_conf))
    return max(values)


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claim", type=int)
    parser.add_argument("--receipts", required=True, type=Path)
    parser.add_argument("--floor", type=int, default=0)
    parser.add_argument("--app-conf", type=Path, default=root / "packages" / APP_ID / "src/main/resources/splunk/default/app.conf")
    parser.add_argument("--floor-file", type=Path, default=root / "BUILD_NUMBER_FLOOR")
    parser.add_argument("--dist", type=Path, default=root / "dist")
    parser.add_argument("--target-app-conf", type=Path, default=Path(os.environ.get("SPLUNK_HOME", "/opt/splunk")) / "etc/apps" / APP_ID / "default/app.conf")
    args = parser.parse_args()
    try:
        if args.claim is not None:
            claim_build(args.claim, args.receipts)
        else:
            floor = args.floor
            if floor < 0:
                raise ReservationError("Build floor must not be negative.")
            if args.app_conf is not None:
                if args.floor_file is None or args.dist is None:
                    raise ReservationError("Build floor metadata arguments are incomplete.")
                floor = max(floor, local_floor(args.app_conf, args.floor_file, args.dist,
                                               APP_ID, args.target_app_conf))
            print(reserve_resilient(floor, args.receipts))
    except (ReservationError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
