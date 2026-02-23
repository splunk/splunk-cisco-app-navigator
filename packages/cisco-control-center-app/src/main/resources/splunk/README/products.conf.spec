# products.conf.spec
#
# Cisco Control Center — Product Catalog Configuration
#
# Each stanza defines a product card in the CCC Products page.
# Stanza name = product_id (e.g. [cisco_asa])
#

[<product_id>]

display_name = <string>
* Card title displayed to the user.

description = <string>
* Short description shown in the card body.

value_proposition = <string>
* One-liner benefit statement shown below the description.

tagline = <string>
* Short tagline displayed beneath the product name on the card.

vendor = <string>
* Product vendor. Typically "Cisco".

category = security | networking | collaboration | infrastructure | observability
* Category used for filtering on the Products page.

version = <string>
* Current version of this product module (e.g. "1.0.0").

status = active | under_development | deprecated
* Product lifecycle status. "under_development" shows a Preview badge.

addon = <string>
* The Splunk app_id of the add-on / TA this card is associated with (e.g. "CiscoSecurityCloud").

addon_family = <string>
* Add-on family grouping used by the build-time catalog generator to map
* products to their parent add-on install flow (e.g. "security-cloud",
* "catalyst", "dc-networking", "cloud-security", "collaboration",
* "observability", "standalone", "deprecated").

addon_label = <string>
* Human-readable label for the required add-on (e.g. "Cisco Security Cloud").

addon_splunkbase_url = <string>
* Splunkbase URL for the required add-on.

addon_docs_url = <string>
* Documentation URL for the required add-on (install guide, configuration reference, etc.).

addon_troubleshoot_url = <string>
* Optional. URL for a troubleshooting guide specific to this add-on.
* Links to diagnostic steps, common issues, and resolution procedures.

addon_install_url = <string>
* Relative Splunk manager URL to install the required add-on from inside Splunk.
* Example: /manager/cisco-control-center-app/appsremote?order=relevance&query="Cisco+Security+Cloud"

app_viz = <string>
* Optional. The Splunk app_id of the visualization / dashboard app (e.g. "cisco-catalyst-app").
* When empty, the UI assumes addon provides both data ingestion and visualization.

app_viz_label = <string>
* Human-readable label for the visualization app (e.g. "Cisco Enterprise Networking for Splunk Platform").

app_viz_splunkbase_url = <string>
* Splunkbase URL for the visualization app.

app_viz_docs_url = <string>
* Documentation URL for the visualization app.

app_viz_troubleshoot_url = <string>
* Optional. URL for a troubleshooting guide specific to the visualization app.
* Links to diagnostic steps, common issues, and resolution procedures.

app_viz_install_url = <string>
* Relative Splunk manager URL to install the visualization app from inside Splunk.

app_viz_2 = <string>
* Optional. A second visualization / dashboard app (e.g. an ITSI content pack).
* When empty, only the primary app_viz is shown.

app_viz_2_label = <string>
* Human-readable label for the second visualization app.

app_viz_2_splunkbase_url = <string>
* Splunkbase URL for the second visualization app.

app_viz_2_docs_url = <string>
* Documentation URL for the second visualization app.

app_viz_2_troubleshoot_url = <string>
* Optional. URL for a troubleshooting guide specific to the second visualization app.
* Links to diagnostic steps, common issues, and resolution procedures.

app_viz_2_install_url = <string>
* Relative Splunk manager URL to install the second visualization app from inside Splunk.

learn_more_url = <string>
* External URL for the "Learn More" button.

legacy_apps = <comma-separated list>
* Comma-separated legacy TA app_ids to detect (e.g. "Splunk_TA_cisco-asa,Splunk_TA_cisco-asa2").

legacy_labels = <comma-separated list>
* Display names parallel to legacy_apps.

legacy_uids = <comma-separated list>
* Splunkbase numeric app IDs parallel to legacy_apps (e.g. "1808,3662").
* Used to construct links: https://splunkbase.splunk.com/app/<uid>

legacy_urls = <comma-separated list>
* Splunkbase URLs parallel to legacy_apps.

prereq_apps = <comma-separated list>
* Comma-separated app_ids for prerequisite dependencies (e.g. "splunk_app_stream,Splunk_TA_stream").
* These are required companion apps that the main addon depends on.

prereq_labels = <comma-separated list>
* Display names parallel to prereq_apps.

prereq_uids = <comma-separated list>
* Splunkbase numeric app IDs parallel to prereq_apps.

prereq_urls = <comma-separated list>
* Splunkbase URLs parallel to prereq_apps.

sourcetypes = <comma-separated list>
* Sourcetypes for MTTI health checks (e.g. "cisco:asa,cisco:asa:syslog").

dashboards = <comma-separated list>
* Dashboard XML view names for the "Launch" button.

custom_dashboard = <string>
* Optional. Customer-defined dashboard to launch instead of (or alongside) the default.
* Format: "app_id/dashboard_name" (e.g. "search/my_custom_duo_dashboard").
* When set, the Launch button offers both the Cisco default and this custom dashboard.
* Typically lives in local/products.conf so it survives app upgrades.

icon_emoji = <string>
* Emoji or short text used as the card icon placeholder.

aliases = <comma-separated list>
* Comma-separated former/alternate product names (e.g. "IronPort Email Security,Email Security Appliance").
* Displayed as a subtle "Formerly: ..." line on the card and included in search.
* Use this to track Cisco product renames so admins can find products by old names.

keywords = <comma-separated list>
* Comma-separated search keywords for the Universal Finder (e.g. "asa,firewall,ftd,ngfw").

alert_action_label = <string>
* Optional. Human-readable label for a companion alert action app.
* When present, indicates a custom alert action exists for this product.
* Alert actions are standalone add-ons (or built into a TA) that fire from
* Splunk saved searches, ES correlation searches, or notable events.

alert_action_uid = <integer>
* Splunkbase numeric app ID for the alert action.

alert_action_url = <string>
* Splunkbase URL for the alert action.

alert_action_2_label = <string>
* Optional. Human-readable label for a second alert action app.

alert_action_2_uid = <integer>
* Splunkbase numeric app ID for the second alert action.

alert_action_2_url = <string>
* Splunkbase URL for the second alert action.

community_apps = <comma-separated list>
* Comma-separated folder names of third-party community add-ons that shadow
* or duplicate the official Cisco add-on for this product.
* When one of these apps is detected at runtime, a migration warning is shown
* on the card advising the admin to switch to the official Cisco add-on.

community_labels = <comma-separated list>
* Display names parallel to community_apps.

community_uids = <comma-separated list>
* Splunkbase numeric app IDs parallel to community_apps.

community_urls = <comma-separated list>
* Splunkbase URLs parallel to community_apps.

soar_connector_label = <string>
* Optional. Human-readable label for the SOAR connector.
* When present, indicates a Splunk SOAR connector exists for this product.
* SOAR connectors run in Splunk SOAR (not Splunk Enterprise), so no app
* folder name is tracked.

soar_connector_uid = <integer>
* Splunkbase numeric app ID for the SOAR connector.

soar_connector_url = <string>
* Splunkbase URL for the SOAR connector.

soar_connector_2_label = <string>
* Optional. Human-readable label for a second SOAR connector.

soar_connector_2_uid = <integer>
* Splunkbase numeric app ID for the second SOAR connector.

soar_connector_2_url = <string>
* Splunkbase URL for the second SOAR connector.

soar_connector_3_label = <string>
* Optional. Human-readable label for a third SOAR connector.

soar_connector_3_uid = <integer>
* Splunkbase numeric app ID for the third SOAR connector.

soar_connector_3_url = <string>
* Splunkbase URL for the third SOAR connector.

itsi_content_pack_label = <string>
* Optional. Human-readable label for an ITSI Content Pack associated with this product.
* ITSI Content Packs are installed via ITSI → Configuration → Data Integrations → Content Library,
* not via Splunkbase. ITSI may run on a dedicated search head.

itsi_content_pack_docs_url = <string>
* Documentation URL for the ITSI Content Pack.

sort_order = <integer>
* Numeric sort weight. Lower values appear first. Default 100.
