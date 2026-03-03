#!/usr/bin/env python3
"""Fix the Talos alert_actions.conf.spec with all required keys in both stanzas."""

content = """[intelligence_collection_from_talos]
param.observable_field = <string> Observable. It is a required parameter.
param.observable_type = <list> Observable Type. Default value is url.
param.index = <list> Select Index. It is a required parameter.
param.indicator = <string> Indicator value for Talos intelligence lookup.
param._cam = <string> JSON configuration for adaptive response framework.
param._cam_workers = <string> Number of adaptive response workers.

[intelligence_enrichment_with_talos]
param.observable_field = <string> Observable. It is a required parameter.
param.observable_type = <list> Observable Type. It is a required parameter. Default value is url.
param.indicator = <string> Indicator value for Talos intelligence lookup.
param._cam = <string> JSON configuration for adaptive response framework.
param._cam_workers = <string> Number of adaptive response workers.
"""

path = "/opt/splunk/etc/apps/Splunk_TA_Talos_Intelligence/README/alert_actions.conf.spec"
with open(path, 'w') as f:
    f.write(content)
print(f"Fixed: {path}")
