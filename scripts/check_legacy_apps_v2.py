#!/usr/bin/env python3
"""Cleaner output: check legacy apps with compact format"""
import os
import configparser

apps = [
    "duo_splunkapp", "TA-DUOSecurity2FA",
    "TA-cisco-etd-connector",
    "TA-cisco-NVM", "CiscoNVM", "tr-splunk-relay",
    "TA-cisco-amp4e", "amp4e_events_input",
    "Splunk_TA_sourcefire", "TA-eStreamer", "eStreamer-Dashboard", "firepower_dashboard",
    "Splunk_TA_cisco-asa", "Splunk_TA_cisco-estreamer_Enosys",
    "TA-cisco-firepower-threat-defense-ftd-sourcetype",
    "TA-cisco-firepower-threat-defense-ftd-dashboards",
    "TA-cisco-firepower-pcap-add-on", "eStreamer", "firegen_cisco_asa",
    "Splunk_CiscoSecuritySuite", "Cisco-suite-for-splunk",
    "TA-cisco-secure-malware-analytics", "TA-cisco-threat-grid",
    "TA-cisco-stealthwatch", "TA-stealthwatch_dataexporter", "cisco_sna_app",
    "Alef_TA_MIMEDecoder",
    "cloudlock",
    "Cisco_WSA_Insight",
    "TA-Umbrella", "TA-cisco-cloud-security-umbrella-addon", "TA-cisco_umbrella", "opendns_investigate",
    "TA-intersight-addon",
    "splunk_app_stream_ipfix_cisco_hsl", "Splunk_TA_cisco_meraki",
    "TA-cisco_meraki_operations", "TA-meraki", "TA_Meraki_SNMP_trap",
    "ta_cisco_thousandeyes", "cisco_thousandeyes_alerting_app_for_splunk",
    "appdynamics", "splunk_app_AppDynamics",
    "TA-cisco_cybervision", "cisco_cybervision_app_for_splunk",
    "Splunk-TA-cisco-dnacenter", "Splunk_CiscoDNACenter",
    "Splunk-TA-cisco-catalyst-center", "Splunk-cisco-catalyst-center",
    "Splunk_TA_cisco-ise", "Splunk_CiscoISE",
    "ta-cisco-sdwan", "cisco-sdwan-app",
    "TA_cisco-Nexus-9k", "TA_cisco-NI", "cisco-app-Nexus-9k", "cisco-app-NI",
    "TA_cisco-ACI", "cisco-app-ACI",
    "TA-cisco_ios", "cisco_ios",
    "TA-DP-webex-teams", "ta-cisco-webex-meetings-add-on-for-splunk",
    "SA_sideview_webex", "cisco_webex_meetings_app_for_splunk",
    "splunk_app_spark_room", "splunk_spark_app", "WebexTeams_AlertAction",
    "SA_cisco_cdr_axl", "TA-ciscoaxl",
    "CMX", "ta_cisco_spaces",
]

# Group mapping for readability
groups = {
    1: ["duo_splunkapp", "TA-DUOSecurity2FA"],
    2: ["TA-cisco-etd-connector"],
    3: ["TA-cisco-NVM", "CiscoNVM", "tr-splunk-relay"],
    4: ["TA-cisco-amp4e", "amp4e_events_input"],
    5: ["Splunk_TA_sourcefire", "TA-eStreamer", "eStreamer-Dashboard", "firepower_dashboard",
        "Splunk_TA_cisco-asa", "Splunk_TA_cisco-estreamer_Enosys",
        "TA-cisco-firepower-threat-defense-ftd-sourcetype",
        "TA-cisco-firepower-threat-defense-ftd-dashboards",
        "TA-cisco-firepower-pcap-add-on", "eStreamer", "firegen_cisco_asa",
        "Splunk_CiscoSecuritySuite", "Cisco-suite-for-splunk"],
    6: ["TA-cisco-secure-malware-analytics", "TA-cisco-threat-grid"],
    7: ["TA-cisco-stealthwatch", "TA-stealthwatch_dataexporter", "cisco_sna_app"],
    8: ["Alef_TA_MIMEDecoder"],
    9: ["cloudlock"],
    10: ["Cisco_WSA_Insight"],
    11: ["TA-Umbrella", "TA-cisco-cloud-security-umbrella-addon", "TA-cisco_umbrella", "opendns_investigate"],
    12: ["TA-intersight-addon"],
    13: ["splunk_app_stream_ipfix_cisco_hsl", "Splunk_TA_cisco_meraki",
         "TA-cisco_meraki_operations", "TA-meraki", "TA_Meraki_SNMP_trap"],
    14: ["ta_cisco_thousandeyes", "cisco_thousandeyes_alerting_app_for_splunk"],
    15: ["appdynamics", "splunk_app_AppDynamics"],
    16: ["TA-cisco_cybervision", "cisco_cybervision_app_for_splunk"],
    17: ["Splunk-TA-cisco-dnacenter", "Splunk_CiscoDNACenter",
         "Splunk-TA-cisco-catalyst-center", "Splunk-cisco-catalyst-center"],
    18: ["Splunk_TA_cisco-ise", "Splunk_CiscoISE"],
    19: ["ta-cisco-sdwan", "cisco-sdwan-app"],
    20: ["TA_cisco-Nexus-9k", "TA_cisco-NI", "cisco-app-Nexus-9k", "cisco-app-NI"],
    21: ["TA_cisco-ACI", "cisco-app-ACI"],
    22: ["TA-cisco_ios", "cisco_ios"],
    23: ["TA-DP-webex-teams", "ta-cisco-webex-meetings-add-on-for-splunk",
         "SA_sideview_webex", "cisco_webex_meetings_app_for_splunk",
         "splunk_app_spark_room", "splunk_spark_app", "WebexTeams_AlertAction"],
    24: ["SA_cisco_cdr_axl", "TA-ciscoaxl"],
    25: ["CMX", "ta_cisco_spaces"],
}

base = "/opt/splunk/etc/apps"

def get_app_info(app_id):
    app_dir = os.path.join(base, app_id)
    exists = os.path.isdir(app_dir)
    label = ""
    version = ""
    flags = []

    if not exists:
        return {"exists": False, "label": "", "version": "", "flags": []}

    for conf_dir in ["default", "local"]:
        conf_path = os.path.join(app_dir, conf_dir, "app.conf")
        if os.path.isfile(conf_path):
            try:
                cp = configparser.ConfigParser(interpolation=None)
                with open(conf_path) as f:
                    content = f.read()
                cp.read_string(content)

                for section in ["launcher", "ui", "package"]:
                    if cp.has_section(section) and cp.has_option(section, "label"):
                        l = cp.get(section, "label")
                        if l:
                            label = l

                for section in ["launcher", "package", "id"]:
                    if cp.has_section(section) and cp.has_option(section, "version"):
                        v = cp.get(section, "version")
                        if v:
                            version = v

                cl = content.lower()
                if "archived" in cl:
                    flags.append("ARCHIVED")
                if "deprecated" in cl:
                    flags.append("DEPRECATED")
                if "obsolete" in cl:
                    flags.append("OBSOLETE")

            except:
                pass

    lbl_lower = label.lower()
    for kw in ["archived", "deprecated", "legacy", "obsolete", "retired"]:
        if kw in lbl_lower:
            flags.append(f"LABEL:{kw}")

    return {"exists": exists, "label": label, "version": version, "flags": list(set(flags))}

for grp_num in sorted(groups.keys()):
    print(f"\n{'='*80}")
    print(f"GROUP {grp_num}")
    print(f"{'='*80}")
    for app_id in groups[grp_num]:
        info = get_app_info(app_id)
        ex = "INSTALLED" if info["exists"] else "NOT FOUND"
        flags = ", ".join(info["flags"]) if info["flags"] else "-"
        print(f"  {app_id}")
        print(f"    Status: {ex}  |  Version: {info['version'] or 'n/a'}  |  Label: {info['label'] or 'n/a'}")
        print(f"    Flags: {flags}")
