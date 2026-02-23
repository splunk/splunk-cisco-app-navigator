#!/usr/bin/env python3
"""Remove duplicate troubleshoot_url lines from products.conf."""
import os

repo = os.path.expanduser("~/repo/cisco_control_center_app")
filepath = os.path.join(repo, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")

with open(filepath, "r") as f:
    lines = f.readlines()

output = []
prev = None
for line in lines:
    stripped = line.strip()
    # Skip duplicate consecutive troubleshoot_url lines
    if stripped == prev and "troubleshoot_url" in stripped:
        continue
    output.append(line)
    prev = stripped

with open(filepath, "w") as f:
    f.writelines(output)

removed = len(lines) - len(output)
print(f"Removed {removed} duplicate lines. {len(output)} lines remain.")
