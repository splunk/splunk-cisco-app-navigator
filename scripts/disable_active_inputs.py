#!/usr/bin/env python3
"""
Disable all active inputs in the 130 Cisco apps by creating/updating local/inputs.conf.
Each stanza gets disabled = 1 in local so it's visible and reversible.
"""
import os
import re

APPS_DIR = "/opt/splunk/etc/apps"

APPS = [
    "Alef_TA_MIMEDecoder", "CMX", "Cisco-suite-for-splunk", "CiscoNVM",
    "Cisco_Bug_Search_and_Analytics", "Cisco_CWS_TA", "Cisco_DP_PD",
    "Cisco_WSA_Insight", "DA-ITSI-CP-CUST-ATLAS-CISCO-DNA",
    "DA-ITSI-CP-CUST-ATLAS-CISCO-WSA", "SA-openVulnQuery", "SA_cisco_cdr_axl",
    "SA_cisco_meeting_server", "SA_oracle_sbc_cdr", "SA_sideview_webex",
    "SA_teams_json", "Splunk-TA-cisco-catalyst-center",
    "Splunk-TA-cisco-dnacenter", "Splunk-cisco-catalyst-center",
    "Splunk_CiscoDNACenter", "Splunk_CiscoISE", "Splunk_CiscoSecuritySuite",
    "Splunk_MCP_Server", "Splunk_TA_AppDynamics", "Splunk_TA_CCX_Cisco_ISE",
    "Splunk_TA_CCX_Cisco_Meraki", "Splunk_TA_CCX_Cisco_Secure_Endpoint",
    "Splunk_TA_CCX_Cisco_Secure_Network_Analytics",
    "Splunk_TA_CCX_DUO_Connector_Support",
    "Splunk_TA_CCX_Unified_Cisco_Firepower_eStreamer",
    "Splunk_TA_Cisco_Intersight", "Splunk_TA_Talos_Intelligence",
    "Splunk_TA_cisco-asa", "Splunk_TA_cisco-esa",
    "Splunk_TA_cisco-estreamer_Enosys", "Splunk_TA_cisco-ips",
    "Splunk_TA_cisco-ise", "Splunk_TA_cisco-ucs", "Splunk_TA_cisco-wsa",
    "Splunk_TA_cisco_meraki", "Splunk_TA_sourcefire", "Splunk_TA_stream",
    "TA-CMX", "TA-Cisco-NVM", "TA-DP-webex-teams", "TA-DUOSecurity2FA",
    "TA-Umbrella", "TA-add-on-for-cisco-prime-infrastructure",
    "TA-cisco-amp4e", "TA-cisco-cloud-security-addon",
    "TA-cisco-cloud-security-umbrella-addon", "TA-cisco-etd-connector",
    "TA-cisco-firepower-pcap-add-on",
    "TA-cisco-firepower-threat-defense-ftd-dashboards",
    "TA-cisco-firepower-threat-defense-ftd-sourcetype",
    "TA-cisco-secure-malware-analytics", "TA-cisco-stealthwatch",
    "TA-cisco-threat-grid", "TA-cisco-threat-response", "TA-cisco_DP_PD",
    "TA-cisco_acs", "TA-cisco_cybervision", "TA-cisco_ios",
    "TA-cisco_meraki_operations", "TA-cisco_umbrella", "TA-ciscoaxl",
    "TA-eStreamer", "TA-intersight-addon", "TA-lcs-plug-in",
    "TA-stealthwatch_dataexporter", "TA-vscode_audit", "TA_Meraki_SNMP_trap",
    "TA_cisco-ACI", "TA_cisco-NI", "TA_cisco-Nexus-9k", "TA_cisco-candid",
    "TA_cisco_catalyst", "TA_cisco_cdr", "TA_oracle_sbc_cdr",
    "WebexTeams_AlertAction", "amp4e_events_input", "appdynamics",
    "botsv3_data_set", "canary", "chargeback_app_splunk_cloud",
    "cisco-app-ACI", "cisco-app-NI", "cisco-app-Nexus-9k", "cisco-app-candid",
    "cisco-catalyst-app", "cisco-cloud-security", "cisco-sdwan-app",
    "cisco_cdr", "cisco_cybervision_app_for_splunk",
    "cisco_dc_networking_app_for_splunk", "cisco_ios",
    "cisco_sna_app", "cisco_thousandeyes_alerting_app_for_splunk",
    "cisco_webex_meetings_app_for_splunk", "cloudlock",
    "demo_addon_for_splunk", "duo_splunkapp", "eStreamer",
    "eStreamer-Dashboard", "field-solutions-demo-data-gen",
    "firegen_cisco_asa", "firepower_dashboard", "insights_app_splunk",
    "is4s_internal", "lcs_insights", "lookup_editor", "meraki_ta",
    "my-todo-app", "opendns_investigate", "relay-module",
    "splunk_app_AppDynamics", "splunk_app_spark_room", "splunk_app_stream",
    "splunk_app_stream_ipfix_cisco_hsl", "splunk_cisco_ise_alert",
    "splunk_ingest_actions", "splunk_spark_app", "ta-cisco-sdwan",
    "ta-cisco-webex-meetings-add-on-for-splunk", "ta_cisco_spaces",
    "ta_cisco_thousandeyes", "ta_cisco_webex_add_on_for_splunk",
    "ti-cisco-vuln", "tr-splunk-relay", "webex_alert",
]

SKIP_STANZAS = {'default', 'SSL'}


def parse_inputs_conf(filepath):
    """Parse inputs.conf and return dict of stanza -> {key: val}."""
    stanzas = {}
    current = None
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            m = re.match(r'^\[(.+)\]$', line)
            if m:
                current = m.group(1)
                stanzas[current] = {}
            elif current and '=' in line:
                key, _, val = line.partition('=')
                stanzas[current][key.strip()] = val.strip()
    return stanzas


def is_already_disabled_in_local(local_stanzas, stanza_name):
    """Check if this stanza is already disabled in local."""
    if stanza_name not in local_stanzas:
        return False
    return local_stanzas[stanza_name].get('disabled', '').lower() in ('1', 'true', 'yes')


total_disabled = 0
total_already = 0
apps_modified = []

for app in sorted(APPS):
    app_dir = os.path.join(APPS_DIR, app)
    if not os.path.isdir(app_dir):
        continue

    default_inputs = os.path.join(app_dir, 'default', 'inputs.conf')
    if not os.path.exists(default_inputs):
        continue

    default_stanzas = parse_inputs_conf(default_inputs)

    local_dir = os.path.join(app_dir, 'local')
    local_inputs = os.path.join(local_dir, 'inputs.conf')

    # Parse existing local if it exists
    local_stanzas = {}
    if os.path.exists(local_inputs):
        local_stanzas = parse_inputs_conf(local_inputs)

    stanzas_to_disable = []

    for stanza, kv in default_stanzas.items():
        if stanza in SKIP_STANZAS:
            continue

        # Check if already disabled in default
        disabled_val = kv.get('disabled', '').lower()
        if disabled_val in ('1', 'true', 'yes'):
            continue

        # Check if already disabled in local
        if is_already_disabled_in_local(local_stanzas, stanza):
            total_already += 1
            continue

        stanzas_to_disable.append(stanza)

    if not stanzas_to_disable:
        continue

    # Create/append to local/inputs.conf
    os.makedirs(local_dir, exist_ok=True)

    # Read existing local content
    existing_content = ''
    if os.path.exists(local_inputs):
        with open(local_inputs, 'r') as f:
            existing_content = f.read()

    with open(local_inputs, 'a') as f:
        if existing_content and not existing_content.endswith('\n'):
            f.write('\n')
        f.write(f'\n# === Disabled by SCAN audit ({len(stanzas_to_disable)} inputs) ===\n')
        for stanza in stanzas_to_disable:
            f.write(f'[{stanza}]\n')
            f.write('disabled = 1\n\n')
            total_disabled += 1

    apps_modified.append((app, len(stanzas_to_disable)))
    print(f"  {app}: disabled {len(stanzas_to_disable)} input(s)")

print(f"\n{'=' * 60}")
print(f"Total inputs disabled: {total_disabled}")
print(f"Already disabled in local: {total_already}")
print(f"Apps modified: {len(apps_modified)}")
print(f"{'=' * 60}")
