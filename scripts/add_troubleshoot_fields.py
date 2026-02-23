#!/usr/bin/env python3
"""Add troubleshoot URL fields to all product stanzas in products.conf."""
import re
import os

repo = os.path.expanduser("~/repo/cisco_control_center_app")
filepath = os.path.join(repo, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")

with open(filepath, "r") as f:
    content = f.read()

# Add addon_troubleshoot_url after addon_docs_url lines
content = re.sub(
    r"(addon_docs_url\s*=\s*[^\n]*\n)(addon_install_url)",
    r"\1addon_troubleshoot_url = \n\2",
    content,
)

# Add app_viz_troubleshoot_url after app_viz_docs_url lines
content = re.sub(
    r"(app_viz_docs_url\s*=\s*[^\n]*\n)(app_viz_install_url)",
    r"\1app_viz_troubleshoot_url = \n\2",
    content,
)

# Add app_viz_2_troubleshoot_url after app_viz_2_docs_url lines
content = re.sub(
    r"(app_viz_2_docs_url\s*=\s*[^\n]*\n)(app_viz_2_install_url)",
    r"\1app_viz_2_troubleshoot_url = \n\2",
    content,
)

with open(filepath, "w") as f:
    f.write(content)

# Verify
count1 = len(re.findall(r"addon_troubleshoot_url", content))
count2 = len(re.findall(r"app_viz_troubleshoot_url", content))
count3 = len(re.findall(r"app_viz_2_troubleshoot_url", content))
print(f"Added: addon_troubleshoot_url={count1}, app_viz_troubleshoot_url={count2}, app_viz_2_troubleshoot_url={count3}")
