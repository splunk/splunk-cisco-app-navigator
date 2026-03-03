#!/usr/bin/env python3
"""
Audit all 130 Cisco-related apps for active inputs in default/inputs.conf.
Reports any inputs that are NOT disabled (i.e., missing disabled=1 or disabled=0/false).
Also checks for scripted inputs, modular inputs, monitors, etc.
"""
import os
import re
import configparser

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

# Input stanza patterns that indicate active data collection
ACTIVE_PATTERNS = re.compile(
    r'^\[(monitor://|script://|powershell://|batch://|udp://|tcp://|splunktcp://|'
    r'http://|https?_input://|modular_input://|WinEventLog://|perfmon://|admon://|'
    r'fschange://|WinRegMon://|WinHostMon://|WinNetMon://|WinPrintMon://|'
    r'queue://|syslog://|fifo://|exec://|'
    r'[a-zA-Z_]+://)',   # Catch-all for any custom modular input type
    re.IGNORECASE
)

# Stanzas to skip (not actual inputs)
SKIP_STANZAS = {'default', 'SSL'}

def parse_inputs_conf(filepath):
    """Parse inputs.conf and return list of (stanza, disabled_status, is_active_type)."""
    results = []
    current_stanza = None
    stanza_lines = {}
    
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            m = re.match(r'^\[(.+)\]$', line)
            if m:
                current_stanza = m.group(1)
                stanza_lines[current_stanza] = {}
            elif current_stanza and '=' in line:
                key, _, val = line.partition('=')
                stanza_lines[current_stanza][key.strip().lower()] = val.strip()
    
    for stanza, kv in stanza_lines.items():
        if stanza in SKIP_STANZAS:
            continue
        disabled_val = kv.get('disabled', '').lower()
        is_disabled = disabled_val in ('1', 'true', 'yes')
        results.append((stanza, is_disabled, kv))
    
    return results

def check_local_overrides(app_dir, stanza):
    """Check if a stanza is disabled in local/inputs.conf."""
    local_inputs = os.path.join(app_dir, 'local', 'inputs.conf')
    if not os.path.exists(local_inputs):
        return False
    
    entries = parse_inputs_conf(local_inputs)
    for s, is_disabled, kv in entries:
        if s == stanza and is_disabled:
            return True
    return False

print("=" * 80)
print("ACTIVE INPUTS AUDIT — 130 Cisco Apps")
print("=" * 80)
print()

active_found = []

for app in sorted(APPS):
    app_dir = os.path.join(APPS_DIR, app)
    if not os.path.isdir(app_dir):
        continue
    
    default_inputs = os.path.join(app_dir, 'default', 'inputs.conf')
    if not os.path.exists(default_inputs):
        continue
    
    entries = parse_inputs_conf(default_inputs)
    
    for stanza, is_disabled, kv in entries:
        # Check if already disabled in local
        local_disabled = check_local_overrides(app_dir, stanza)
        
        if not is_disabled and not local_disabled:
            active_found.append((app, stanza, kv))

if active_found:
    print(f"Found {len(active_found)} ACTIVE input(s) that need disabling:\n")
    current_app = None
    for app, stanza, kv in active_found:
        if app != current_app:
            print(f"\n  APP: {app}")
            print(f"  {'─' * 60}")
            current_app = app
        interval = kv.get('interval', 'N/A')
        index = kv.get('index', 'default')
        sourcetype = kv.get('sourcetype', 'N/A')
        print(f"    [{stanza}]")
        print(f"      interval={interval}  index={index}  sourcetype={sourcetype}")
else:
    print("No active inputs found. All inputs are already disabled.")

print(f"\n{'=' * 80}")
print(f"Total apps checked: {sum(1 for a in APPS if os.path.isdir(os.path.join(APPS_DIR, a)))}")
print(f"Apps with default/inputs.conf: {sum(1 for a in APPS if os.path.exists(os.path.join(APPS_DIR, a, 'default', 'inputs.conf')))}")
print(f"Active inputs found: {len(active_found)}")
print(f"{'=' * 80}")
