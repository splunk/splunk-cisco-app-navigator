#!/bin/bash
SRC="/Users/akhamis/cisco/icons"
DST="/Users/akhamis/repo/splunk-cisco-app-navigator/packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/icons"
FONTS_SRC="/Users/akhamis/cisco/fonts"
FONTS_DST="/Users/akhamis/repo/splunk-cisco-app-navigator/packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/fonts"
STATIC="/Users/akhamis/repo/splunk-cisco-app-navigator/packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static"

mkdir -p "$DST" "$FONTS_DST"

# ── Midnight icons (light mode) ──
for pair in \
  "Firewall:firewall" \
  "Endpoint:endpoint" \
  "ISE:ise" \
  "Mail:mail" \
  "Umbrella:umbrella" \
  "CiscoDuo:duo" \
  "XDR:xdr" \
  "Secure_Access:secure_access" \
  "SASE:sase" \
  "Cloudlock:cloudlock" \
  "SecurityCloud:security_cloud" \
  "Analytics and Logging:analytics_logging" \
  "Network Analytics:network_analytics" \
  "Cloud Analytics:cloud_analytics" \
  "Cloud Insights:cloud_insights" \
  "Malware Analytics:malware_analytics" \
  "Web Appliance:web_appliance" \
  "Web Application Firewall:waf" \
  "Web Application Firewall Cloud:waf_cloud" \
  "Workload:workload" \
  "Vulnerability_Management:vulnerability_mgmt" \
  "Vulnerability_Intel:vulnerability_intel" \
  "DDoS Protection:ddos" \
  "DDoS Protection Cloud:ddos_cloud" \
  "Application_Security:app_security" \
  "Application Delivery Controller:app_delivery" \
  "Client:client"
do
  IFS=: read -r from to <<< "$pair"
  cp "$SRC/Cisco_Security_Mktg_Icons_midnight_${from}.svg" "$DST/${to}.svg" 2>/dev/null && echo "  ✓ ${to}.svg"
  cp "$SRC/Cisco_Security_Mktg_Icons_white_${from}.svg" "$DST/${to}_white.svg" 2>/dev/null && echo "  ✓ ${to}_white.svg"
done

echo ""
echo "Icons copied: $(ls "$DST" | wc -l | tr -d ' ')"

# ── Fonts (3 weights) ──
cp "$FONTS_SRC/CiscoSansTTRegular.woff2" "$FONTS_DST/" 2>/dev/null && echo "  ✓ CiscoSansTTRegular.woff2"
cp "$FONTS_SRC/CiscoSansTT-Medium.woff2" "$FONTS_DST/" 2>/dev/null && echo "  ✓ CiscoSansTT-Medium.woff2"
cp "$FONTS_SRC/CiscoSansTTBold.woff2" "$FONTS_DST/" 2>/dev/null && echo "  ✓ CiscoSansTTBold.woff2"
# Also copy TTF fallbacks
cp "$FONTS_SRC/CiscoSansTTRegular.ttf" "$FONTS_DST/" 2>/dev/null && echo "  ✓ CiscoSansTTRegular.ttf"
cp "$FONTS_SRC/CiscoSansTT-Medium.ttf" "$FONTS_DST/" 2>/dev/null && echo "  ✓ CiscoSansTT-Medium.ttf"
cp "$FONTS_SRC/CiscoSansTTBold.ttf" "$FONTS_DST/" 2>/dev/null && echo "  ✓ CiscoSansTTBold.ttf"

echo ""
echo "Fonts copied: $(ls "$FONTS_DST" | wc -l | tr -d ' ')"

# ── Background image ──
cp "/Users/akhamis/cisco/photos/1920x1080_Webex_Background_2025.jpg" "$STATIC/bg-cisco.jpg" 2>/dev/null && echo "  ✓ bg-cisco.jpg"

# ── Cisco Logo SVGs ──
cp "/Users/akhamis/cisco/logos/Cisco Logo/Cisco_Logo_no_TM_Midnight_Blue-RGB.svg" "$STATIC/cisco-logo-midnight.svg" 2>/dev/null && echo "  ✓ cisco-logo-midnight.svg"
cp "/Users/akhamis/cisco/logos/Cisco Logo/Cisco_Logo_no_TM_White-RGB.svg" "$STATIC/cisco-logo-white.svg" 2>/dev/null && echo "  ✓ cisco-logo-white.svg"

echo ""
echo "All done!"
