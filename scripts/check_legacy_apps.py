#!/usr/bin/env python3
"""Check legacy app IDs for existence and metadata at /opt/splunk/etc/apps/"""
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

base = "/opt/splunk/etc/apps"

fmt = "{:<55} | {:^7} | {:<12} | {:<60} | {}"
print(fmt.format("APP_ID", "EXISTS", "VERSION", "LABEL", "NOTES"))
print("-"*55 + " | " + "-"*7 + " | " + "-"*12 + " | " + "-"*60 + " | " + "-"*40)

for app_id in apps:
    app_dir = os.path.join(base, app_id)
    exists = os.path.isdir(app_dir)
    label = ""
    version = ""
    notes = []

    if exists:
        for conf_dir in ["default", "local"]:
            conf_path = os.path.join(app_dir, conf_dir, "app.conf")
            if os.path.isfile(conf_path):
                try:
                    cp = configparser.ConfigParser(interpolation=None)
                    with open(conf_path) as f:
                        content = f.read()
                    cp.read_string(content)

                    for section in ["launcher", "ui", "package"]:
                        if cp.has_section(section):
                            if cp.has_option(section, "label"):
                                l = cp.get(section, "label")
                                if l:
                                    label = l

                    for section in ["launcher", "package", "id"]:
                        if cp.has_section(section):
                            if cp.has_option(section, "version"):
                                v = cp.get(section, "version")
                                if v:
                                    version = v

                    content_lower = content.lower()
                    if "archived" in content_lower:
                        notes.append("ARCHIVED")
                    if "deprecated" in content_lower:
                        notes.append("DEPRECATED")
                    if "obsolete" in content_lower:
                        notes.append("OBSOLETE")

                    if cp.has_section("install"):
                        if cp.has_option("install", "state"):
                            notes.append("state=" + cp.get("install", "state"))
                        if cp.has_option("install", "is_configured"):
                            notes.append("configured=" + cp.get("install", "is_configured"))

                except Exception as e:
                    notes.append("ERR: " + str(e))

        label_lower = label.lower()
        if any(kw in label_lower for kw in ["archived", "deprecated", "legacy", "obsolete", "retired"]):
            notes.append("KEYWORD_IN_LABEL")

    exists_str = "YES" if exists else "no"
    notes_str = "; ".join(notes) if notes else ""
    print(fmt.format(app_id, exists_str, version, label, notes_str))
