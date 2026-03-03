#!/usr/bin/env python3
"""Fix btool spec files for Talos Intelligence, ThousandEyes, and Webex apps."""
import os

# --- Talos Intelligence inputs.conf.spec ---
talos_inputs_spec = """[threatlist://<name>]
debug = <integer> Enable debug logging. 0 = off, 1 = on.
delim_regex = <string> Delimiter regex for parsing threat list entries.
description = <string> Human-readable description of this threat list.
file_parser = <string> Parser mode for the threat list file. Default: auto.
ignore_regex = <string> Regex pattern for lines to ignore in the threat list.
interval = <integer> Polling interval in seconds.
is_threatintel = <boolean> Whether this input feeds the threat intelligence framework.
max_age = <string> Maximum age of threat intel entries before expiry.
max_size = <integer> Maximum file size in bytes.
retries = <integer> Number of download retries on failure.
retry_interval = <integer> Seconds between retries.
sinkhole = <boolean> Whether to sinkhole matching traffic.
skip_header_lines = <integer> Number of header lines to skip.
timeout = <integer> HTTP request timeout in seconds.
type = <string> Input type identifier.
url = <string> URL to download the threat list from.
weight = <integer> Weight/priority for this threat list.
parse_modifiers = <string> JSON object with parsing modifier flags.
fields = <string> Field extraction mapping for each line.
disabled = <boolean> Whether this input is disabled.
"""

# --- ThousandEyes app.conf.spec ---
te_app_spec = """[triggers]
notable_event_actions = <string> Trigger action on notable events.
"""

# --- ThousandEyes inputs.conf.spec ---
te_readme = "/opt/splunk/etc/apps/ta_cisco_thousandeyes/README"
te_inputs_spec_path = os.path.join(te_readme, "inputs.conf.spec")
# Check if spec exists and read it
te_inputs_spec_extra = """
[test_traces_stream]
related_paths = <boolean> Whether to include related paths. 0 = off, 1 = on.
"""

# --- Webex Alert app.conf.spec ---
webex_app_spec = """[id]
id = <string> Application identifier for the Webex Alert action app.
"""

apps_dir = "/opt/splunk/etc/apps"

fixes = [
    (f"{apps_dir}/Splunk_TA_Talos_Intelligence/README/inputs.conf.spec", talos_inputs_spec, "write"),
    (f"{apps_dir}/ta_cisco_thousandeyes/README/app.conf.spec", te_app_spec, "write"),
    (f"{apps_dir}/webex_alert/README/app.conf.spec", webex_app_spec, "write"),
]

for path, content, mode in fixes:
    readme_dir = os.path.dirname(path)
    os.makedirs(readme_dir, exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)
    print(f"  Created: {path}")

# ThousandEyes inputs.conf.spec — append or create
if os.path.exists(te_inputs_spec_path):
    with open(te_inputs_spec_path, 'r') as f:
        existing = f.read()
    if 'related_paths' not in existing:
        with open(te_inputs_spec_path, 'a') as f:
            f.write(te_inputs_spec_extra)
        print(f"  Appended related_paths to: {te_inputs_spec_path}")
    else:
        print(f"  Already has related_paths: {te_inputs_spec_path}")
else:
    os.makedirs(te_readme, exist_ok=True)
    with open(te_inputs_spec_path, 'w') as f:
        f.write(te_inputs_spec_extra.lstrip())
    print(f"  Created: {te_inputs_spec_path}")

print("\nDone fixing spec files!")
