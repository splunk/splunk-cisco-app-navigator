"""
Reorganize sort_order in products.conf for logical grouping within each category.

Design principles:
  - Within each category, group by addon_family / functional area
  - Within each group, sort by importance / recognition then alphabetical
  - Coming Soon products appear at the end of their category
  - Deprecated products stay at the end (highest sort_order)
  - Use gaps (multiples of 10 between groups, 1 between items) for future insertions
"""

import re

CONF = "/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf"

# ─── New sort_order map ───
# Key = stanza id, Value = new sort_order
#
# SECURITY (10-99)
#   10-29: security-cloud family (the Cisco Security Cloud add-on products)
#          Grouped by functional area:
#            - Firewall / Network Security
#            - Identity & Access
#            - Endpoint
#            - Email / Messaging
#            - Threat Intel / Analytics
#            - Cloud & AI
#   30-39: cloud-security family (Umbrella, Secure Access)
#   40-49: standalone security (ESA, WSA, Cloudlock, Talos)
#   50-59: infrastructure that shows in security (UCS, Intersight)
#   60-69: coming soon security
#
# NETWORKING (100-199)
#   100-119: catalyst family (campus/WAN)
#   120-129: dc-networking family (data center)
#   130-139: other networking
#
# OBSERVABILITY (200-209)
#
# COLLABORATION (300-309)
#
# DEPRECATED (900+)

SORT_MAP = {
    # ── SECURITY: Firewall / Network Security ──
    "cisco_secure_firewall":           10,   # Flagship — most recognized
    "cisco_secure_network_analytics":  11,   # StealthWatch / network analytics
    "cisco_multicloud_defense":        12,   # Cloud firewall
    "cisco_nvm":                       13,   # Network Visibility Module (Secure Client)

    # ── SECURITY: Identity & Access ──
    "cisco_duo":                       15,   # Most popular security product
    "cisco_identity_intelligence":     16,   # Identity analytics
    "cisco_secure_access":             17,   # SSE / Zero Trust access

    # ── SECURITY: Endpoint ──
    "cisco_secure_endpoint":           20,   # AMP / endpoint protection
    "cisco_secure_workload":           21,   # Tetration / workload segmentation
    "cisco_secure_malware_analytics":  22,   # Threat Grid / sandbox

    # ── SECURITY: Email & Messaging ──
    "cisco_etd":                       25,   # Email Threat Defense (modern)
    "cisco_esa":                       26,   # Email Security Appliance (legacy standalone)

    # ── SECURITY: Threat Intel / Analytics / XDR ──
    "cisco_xdr":                       30,   # Extended Detection & Response
    "cisco_talos":                     31,   # Threat intelligence
    "cisco_vulnerability_intelligence": 32,  # Vulnerability intel

    # ── SECURITY: Cloud, AI & Specialized ──
    "cisco_ai_defense":                35,   # AI Defense
    "cisco_umbrella":                  36,   # DNS / cloud security
    "cisco_cloudlock":                 37,   # CASB
    "cisco_isovalent":                 38,   # eBPF / cloud-native security
    "cisco_isovalent_edge_processor":  39,   # Isovalent edge

    # ── SECURITY: Infrastructure (shown in security category) ──
    "cisco_ucs":                       45,   # UCS compute
    "cisco_intersight":                46,   # Intersight management
    "cisco_wsa":                       47,   # Web Security Appliance

    # ── SECURITY: Coming Soon ──
    "cisco_evm":                       80,
    "cisco_secure_endpoint_edr":       81,
    "cisco_radware":                   82,
    "cisco_appomni":                   83,   # also disabled

    # ── NETWORKING: Catalyst / Campus & WAN ──
    "cisco_catalyst_center":          100,   # DNA Center — management hub
    "cisco_catalyst_switches":        101,   # Core switching
    "cisco_catalyst_sdwan":           102,   # SD-WAN
    "cisco_ise":                      103,   # Identity Services Engine (network access)
    "cisco_access_points":            104,   # Wireless APs
    "cisco_wlc":                      105,   # Wireless LAN Controller
    "cisco_meraki":                   106,   # Cloud-managed networking
    "cisco_cyber_vision":             107,   # OT / industrial networking
    "cisco_asr":                      108,   # Aggregation Services Routers
    "cisco_isr":                      109,   # Integrated Services Routers
    "cisco_crs":                      110,   # Carrier Routing System
    "cisco_nexus":                    111,   # Nexus switches (campus/general)

    # ── NETWORKING: Data Center ──
    "cisco_aci":                      120,   # ACI fabric
    "cisco_nexus_dashboard":          121,   # Nexus Dashboard
    "cisco_nexus_hyperfabric":        122,   # Nexus HyperFabric

    # ── OBSERVABILITY ──
    "cisco_thousandeyes":             200,   # Digital experience monitoring
    "cisco_appdynamics":              201,   # Application performance

    # ── COLLABORATION ──
    "cisco_webex":                    300,   # Core collaboration
    "cisco_cucm":                     301,   # Unified Communications
    "cisco_meeting_server":           302,   # Meeting Server

    # ── DEPRECATED ──
    "cisco_cloud_web_security":       900,
    "cisco_domain_protection":        901,
    "cisco_network_assurance_engine": 902,
    "cisco_prime_infrastructure":     903,
    "cisco_psirt":                    904,
    "cisco_acs":                      905,
    "cisco_securex":                  906,
    "cisco_secure_ips":               907,
    "cisco_cmx":                      908,
    "cisco_bug_search":               909,
}


def main():
    with open(CONF) as f:
        lines = f.readlines()

    changes = 0
    stanza = None
    for i, line in enumerate(lines):
        s = line.strip()
        m = re.match(r'^\[(.+)\]$', s)
        if m:
            stanza = m.group(1)
            continue
        if stanza and s.startswith('sort_order'):
            if stanza in SORT_MAP:
                old_val = s.split('=', 1)[1].strip()
                new_val = str(SORT_MAP[stanza])
                if old_val != new_val:
                    lines[i] = f"sort_order = {new_val}\n"
                    print(f"  [{stanza}] {old_val} -> {new_val}")
                    changes += 1
            else:
                print(f"  WARNING: [{stanza}] not in SORT_MAP!")

    with open(CONF, 'w') as f:
        f.writelines(lines)

    print(f"\nUpdated {changes} sort_order values.")

    # Verify — re-read and display new order
    with open(CONF) as f:
        lines = f.readlines()
    stanza = None
    products = []
    fields = {}
    for line in lines:
        s = line.strip()
        m = re.match(r'^\[(.+)\]$', s)
        if m:
            if stanza:
                products.append(fields.copy())
            stanza = m.group(1)
            fields = {'id': stanza}
        elif stanza and '=' in s and not s.startswith('#'):
            k, v = s.split('=', 1)
            fields[k.strip()] = v.strip()
    if stanza:
        products.append(fields.copy())

    products.sort(key=lambda p: (p.get('category', ''), int(p.get('sort_order', '100')), p.get('display_name', '')))
    current_cat = ''
    print("\n═══ NEW CARD ORDER ═══")
    for p in products:
        cat = p.get('category', '')
        if cat != current_cat:
            print(f"\n  ── {cat.upper()} ──")
            current_cat = cat
        so = int(p.get('sort_order', '100'))
        name = p.get('display_name', '')
        family = p.get('addon_family', '')
        status = p.get('status', '')
        disabled = p.get('disabled', '')
        badge = ''
        if disabled == '1':
            badge = ' [DISABLED]'
        elif status == 'under_development':
            badge = ' [COMING SOON]'
        elif status == 'deprecated':
            badge = ' [DEPRECATED]'
        print(f"    {so:3d}  {name}{badge}")


if __name__ == '__main__':
    main()
