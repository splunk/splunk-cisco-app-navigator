#!/usr/bin/env python3
"""
Strategic sort_order and keyword cleanup for products.conf.

Sort Strategy:
  - SECURITY:       10-89 active, 900-909 retired
  - NETWORKING:     100-149 active, 899-908 retired
  - OBSERVABILITY:  200-209 active
  - COLLABORATION:  300-309 active

Within each category, related products are placed adjacent:
  SECURITY:
    10-15  Network Security (Firewall → SNA → Cloud Control → Hypershield → ETA → EVE)
    20-22  Identity & Access (Duo → CII → pxGrid)
    25-27  Endpoint Security (Secure Endpoint → NVM → EVM)
    30-33  Threat Intel & Response (XDR → Talos → Vuln Intel → Malware Analytics)
    35-36  Email Security (ETD → ESA)
    40-47  Cloud Security (Secure Access → Umbrella → Investigate → Cloudlock → MCD → Panoptica → AppOmni → WSA)
    50-53  Workload & AI (Secure Workload → AI Defense → Isovalent → IEP)
    55     Application Security (Radware)
    60     OT Security (SEA)

  NETWORKING:
    100-106  Campus & Wireless (Catalyst Center → Switches → ISE → AP → WLC → Meraki → Spaces)
    110-116  Routing & WAN (SD-WAN → ASR → ISR → CRS → 8000 → NCS → NetFlow)
    120-126  Data Center (ACI → Nexus → ND → HyperFabric → MDS → Optics → AI Factory)
    130-132  Compute (UCS → Intersight → IMC)
    140-141  Industrial/OT (Industrial Net → Cyber Vision)

  OBSERVABILITY:
    200-202  (ThousandEyes → AppDynamics → PCA)

  COLLABORATION:
    300-305  (Webex → CUCM → CMS → Meeting Mgmt → TVCS → Hardware)

Keyword Strategy:
  - Primary acronym/short name first
  - Official full product name
  - Unique technical terms (protocols, model numbers)
  - Remove generic/cross-cutting terms: sc4s, itsi, security, network, management
  - Remove terms that are substrings of common English words (causing false positives)
  - Each keyword should be specific enough to uniquely identify the product
"""

import re
import os

CONF = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'packages',
    'splunk-cisco-app-navigator', 'src', 'main', 'resources', 'splunk',
    'default', 'products.conf'
)

# ── SORT ORDER ───────────────────────────────────────────────────────────────
# New sort_order values by product_id
SORT_ORDER = {
    # ── SECURITY: Network Security ──
    'cisco_secure_firewall':           10,
    'cisco_secure_network_analytics':  11,
    'cisco_security_cloud_control':    12,
    'cisco_hypershield':               13,
    'cisco_eta':                       14,
    'cisco_eve':                       15,

    # ── SECURITY: Identity & Access ──
    'cisco_duo':                       20,
    'cisco_identity_intelligence':     21,
    'cisco_pxgrid':                    22,

    # ── SECURITY: Endpoint ──
    'cisco_secure_endpoint':           25,
    'cisco_nvm':                       26,
    'cisco_evm':                       27,

    # ── SECURITY: Threat Intel & Response ──
    'cisco_xdr':                       30,
    'cisco_talos':                     31,
    'cisco_vulnerability_intelligence':32,
    'cisco_secure_malware_analytics':  33,

    # ── SECURITY: Email ──
    'cisco_etd':                       35,
    'cisco_esa':                       36,

    # ── SECURITY: Cloud Security ──
    'cisco_secure_access':             40,
    'cisco_umbrella':                  41,
    'cisco_umbrella_investigate':      42,
    'cisco_cloudlock':                 43,
    'cisco_multicloud_defense':        44,
    'cisco_panoptica':                 45,
    'cisco_appomni':                   46,
    'cisco_wsa':                       47,

    # ── SECURITY: Workload & AI ──
    'cisco_secure_workload':           50,
    'cisco_ai_defense':                51,
    'cisco_isovalent':                 52,
    'cisco_isovalent_edge_processor':  53,

    # ── SECURITY: Application Security ──
    'cisco_radware':                   55,

    # ── SECURITY: OT Security ──
    'cisco_secure_equipment_access':   60,

    # ── SECURITY: Retired ──
    'cisco_cloud_web_security':        900,
    'cisco_domain_protection':         901,
    'cisco_psirt':                     904,
    'cisco_acs':                       905,
    'cisco_securex':                   906,
    'cisco_secure_ips':                907,
    'cisco_bug_search':                909,

    # ── NETWORKING: Campus & Wireless ──
    'cisco_catalyst_center':           100,
    'cisco_catalyst_switches':         101,
    'cisco_ise':                       102,
    'cisco_access_points':             103,
    'cisco_wlc':                       104,
    'cisco_meraki':                    105,
    'cisco_spaces':                    106,

    # ── NETWORKING: Routing & WAN ──
    'cisco_catalyst_sdwan':            110,
    'cisco_asr':                       111,
    'cisco_isr':                       112,
    'cisco_crs':                       113,
    'cisco_8000_routers':              114,
    'cisco_ncs':                       115,
    'cisco_netflow':                   116,

    # ── NETWORKING: Data Center ──
    'cisco_aci':                       120,
    'cisco_nexus':                     121,
    'cisco_nexus_dashboard':           122,
    'cisco_nexus_hyperfabric':         123,
    'cisco_mds_switches':              124,
    'cisco_optics_cmis':               125,
    'cisco_secure_ai_factory':         126,

    # ── NETWORKING: Compute ──
    'cisco_ucs':                       130,
    'cisco_intersight':                131,
    'cisco_imc':                       132,

    # ── NETWORKING: Industrial/OT ──
    'cisco_industrial_networking':     140,
    'cisco_cyber_vision':              141,

    # ── NETWORKING: Retired ──
    'cisco_ace':                       899,
    'cisco_network_assurance_engine':  902,
    'cisco_prime_infrastructure':      903,
    'cisco_cmx':                       908,

    # ── OBSERVABILITY ──
    'cisco_thousandeyes':              200,
    'cisco_appdynamics':               201,
    'cisco_provider_connectivity_assurance': 202,

    # ── COLLABORATION ──
    'cisco_webex':                     300,
    'cisco_cucm':                      301,
    'cisco_meeting_server':            302,
    'cisco_meeting_management':        303,
    'cisco_tvcs':                      304,
    'cisco_collab_hardware':           305,
}

# ── KEYWORDS ─────────────────────────────────────────────────────────────────
# Cleaned keywords: specific, no cross-cutting noise, primary ID first
KEYWORDS = {
    # ── SECURITY: Network Security ──
    'cisco_secure_firewall':
        'ftd,firepower,asa,ngfw,estreamer,firesight,intrusion prevention,firewall',
    'cisco_secure_network_analytics':
        'sna,stealthwatch,ndr,encrypted traffic analytics,eta,netflow analytics',
    'cisco_security_cloud_control':
        'security cloud control,scc,cdo,defense orchestrator,firewall policy,policy orchestration',
    'cisco_hypershield':
        'hypershield,distributed firewall,autonomous security,ai firewall',
    'cisco_eta':
        'encrypted traffic analytics,eta,encrypted malware detection,splt,idp,tls analytics',
    'cisco_eve':
        'encrypted visibility engine,eve,tls fingerprint,encrypted application identification',

    # ── SECURITY: Identity & Access ──
    'cisco_duo':
        'duo,mfa,multi-factor authentication,two-factor,2fa,device trust,adaptive access,sso',
    'cisco_identity_intelligence':
        'identity intelligence,cii,identity posture,compromised accounts,itdr,lateral movement',
    'cisco_pxgrid':
        'pxgrid,platform exchange grid,context sharing,trustsec,sgt,session directory,adaptive network control',

    # ── SECURITY: Endpoint ──
    'cisco_secure_endpoint':
        'secure endpoint,amp,advanced malware protection,edr,endpoint detection,threat hunting',
    'cisco_nvm':
        'nvm,network visibility module,nvzflow,anyconnect nvm,secure client nvm,endpoint flow',
    'cisco_evm':
        'evm,endpoint visibility module,process mapping,flow to process,endpoint telemetry',

    # ── SECURITY: Threat Intel & Response ──
    'cisco_xdr':
        'xdr,extended detection and response,securex,incident response,soc,threat response',
    'cisco_talos':
        'talos,threat intelligence,ioc,ip reputation,domain reputation,file reputation,snort',
    'cisco_vulnerability_intelligence':
        'vulnerability intelligence,cvi,cve,cvss,exploit,risk score',
    'cisco_secure_malware_analytics':
        'secure malware analytics,threat grid,sandbox,file detonation,behavioral analysis,sample submission',

    # ── SECURITY: Email ──
    'cisco_etd':
        'etd,email threat defense,phishing,bec,business email compromise,email protection',
    'cisco_esa':
        'esa,email security appliance,ironport,anti-spam,email gateway,dlp,message tracking',

    # ── SECURITY: Cloud Security ──
    'cisco_secure_access':
        'secure access,sse,ztna,zero trust network access,swg,secure web gateway,casb,remote access',
    'cisco_umbrella':
        'umbrella,opendns,dns security,dns layer,web filtering,sig,secure internet gateway',
    'cisco_umbrella_investigate':
        'umbrella investigate,dns intelligence,passive dns,whois,co-occurrence,domain investigation',
    'cisco_cloudlock':
        'cloudlock,casb,cloud access security broker,saas security,shadow it,cloud dlp',
    'cisco_multicloud_defense':
        'multicloud defense,mcd,cloud firewall,multi-cloud,aws azure gcp,oci',
    'cisco_panoptica':
        'panoptica,cnapp,container security,service mesh,api security,cloud workload protection,calisti',
    'cisco_appomni':
        'appomni,sspm,saas posture management,configuration audit,data exposure,shadow access',
    'cisco_wsa':
        'wsa,secure web appliance,web proxy,url filtering,content filtering,ironport web',

    # ── SECURITY: Workload & AI ──
    'cisco_secure_workload':
        'secure workload,tetration,microsegmentation,workload protection,zero trust segmentation',
    'cisco_ai_defense':
        'ai defense,ai network defense,automated threat detection,ml security',
    'cisco_isovalent':
        'isovalent,ebpf,cilium,tetragon,kubernetes security,k8s,cloud native security,runtime enforcement',
    'cisco_isovalent_edge_processor':
        'isovalent edge processor,iep,data reduction,observability pipeline,telemetry processing',

    # ── SECURITY: Application Security ──
    'cisco_radware':
        'radware,ddos,anti-ddos,bot management,waf,web application firewall,api protection',

    # ── SECURITY: OT Security ──
    'cisco_secure_equipment_access':
        'secure equipment access,sea,ot remote access,industrial privileged access,ot zero trust',

    # ── SECURITY: Retired ──
    'cisco_cloud_web_security':
        'cws,cloud web security,web proxy,url filtering,web gateway',
    'cisco_domain_protection':
        'domain protection,dmarc,dkim,spf,email fraud,brand protection,dmp',
    'cisco_psirt':
        'psirt,openvuln,security advisory,cve advisory,patch management,vulnerability disclosure',
    'cisco_acs':
        'acs,access control server,tacacs,radius,aaa,authentication authorization accounting',
    'cisco_securex':
        'securex,ctr,cisco threat response,ribbon,security orchestration',
    'cisco_secure_ips':
        'secure ips,intrusion prevention system,ids,intrusion detection,sdee,signature-based',
    'cisco_bug_search':
        'bug search tool,bst,cisco defect,bug analytics',

    # ── NETWORKING: Campus & Wireless ──
    'cisco_catalyst_center':
        'catalyst center,dnac,dna center,intent-based networking,sd-access,network assurance',
    'cisco_catalyst_switches':
        'catalyst switch,catalyst 9200,catalyst 9300,catalyst 9400,catalyst 9500,catalyst 9600,2960,3850,campus switch',
    'cisco_ise':
        'ise,identity services engine,nac,network access control,radius,tacacs,802.1x,trustsec,sgacl,guest access',
    'cisco_access_points':
        'access point,catalyst ap,aironet,wifi 6,wifi 6e,capwap,wireless ap',
    'cisco_wlc':
        'wlc,wireless lan controller,wifi controller,ap management,rogue ap detection,flexconnect,aireos',
    'cisco_meraki':
        'meraki,cloud managed networking,meraki dashboard,meraki api,meraki sd-wan,client analytics',
    'cisco_spaces':
        'cisco spaces,dna spaces,location services,indoor positioning,asset tracking,occupancy analytics,smart building',

    # ── NETWORKING: Routing & WAN ──
    'cisco_catalyst_sdwan':
        'sd-wan,sdwan,viptela,vmanage,vedge,catalyst sd-wan,wan optimization',
    'cisco_asr':
        'asr,aggregation services router,asr 1000,asr 9000,asr 900,mpls,segment routing',
    'cisco_isr':
        'isr,integrated services router,isr 1000,isr 4000,isr 4451,branch router',
    'cisco_crs':
        'crs,carrier routing system,ios xr,core router,service provider routing,multi-terabit',
    'cisco_8000_routers':
        '8000 series router,silicon one,ios xr,carrier router,400gbe,backbone router',
    'cisco_ncs':
        'ncs,network convergence system,ncs 540,ncs 560,ncs 5500,ncs 5700,5g backhaul,metro ethernet',
    'cisco_netflow':
        'netflow,ipfix,flexible netflow,netflow v9,flow data,traffic analytics,flow telemetry',

    # ── NETWORKING: Data Center ──
    'cisco_aci':
        'aci,apic,application centric infrastructure,epg,micro-segmentation,sdn,software defined networking',
    'cisco_nexus':
        'nexus,nx-os,nxos,nexus 9000,nexus 7000,n9k,spine leaf,vxlan,data center switch',
    'cisco_nexus_dashboard':
        'nexus dashboard,nexus dashboard insights,nexus dashboard orchestrator,ndi,ndo,fabric controller',
    'cisco_nexus_hyperfabric':
        'nexus hyperfabric,hyperfabric,cloud managed fabric,dcn',
    'cisco_mds_switches':
        'mds,mds 9000,san switch,fibre channel,fcoe,storage networking,fabric switch',
    'cisco_optics_cmis':
        'optics,cmis,transceiver,sfp,qsfp,pluggable,optical power,bit error rate,predictive failure',
    'cisco_secure_ai_factory':
        'secure ai factory,saif,ai infrastructure,ai fabric,ai workload',

    # ── NETWORKING: Compute ──
    'cisco_ucs':
        'ucs,unified computing system,blade server,fabric interconnect,cimc,ucsm,c-series,b-series',
    'cisco_intersight':
        'intersight,ucs management,cloud operations,workload optimization,hyperflex',
    'cisco_imc':
        'imc,cimc,baseboard management controller,bmc,rack server management,redfish,ipmi',

    # ── NETWORKING: Industrial/OT ──
    'cisco_industrial_networking':
        'industrial ethernet,ie3300,ie3400,ie9300,ir1100,ir8100,ir8340,ot networking,din rail',
    'cisco_cyber_vision':
        'cyber vision,ccv,ot security,ics visibility,scada,operational technology asset discovery,iot security',

    # ── NETWORKING: Retired ──
    'cisco_ace':
        'ace,application control engine,load balancer,adc,ssl offload',
    'cisco_network_assurance_engine':
        'nae,network assurance engine,candid,intent verification,aci assurance',
    'cisco_prime_infrastructure':
        'prime infrastructure,cisco prime,nms,device lifecycle,campus management',
    'cisco_cmx':
        'cmx,connected mobile experiences,location analytics,wifi analytics,venue analytics,proximity',

    # ── OBSERVABILITY ──
    'cisco_thousandeyes':
        'thousandeyes,digital experience monitoring,dem,internet visibility,path visualization,synthetic monitoring',
    'cisco_appdynamics':
        'appdynamics,appd,apm,application performance monitoring,business transactions,full stack observability',
    'cisco_provider_connectivity_assurance':
        'provider connectivity assurance,pca,accedian,skylight,service assurance,sla monitoring,synthetic testing',

    # ── COLLABORATION ──
    'cisco_webex':
        'webex,webex meetings,webex calling,webex teams,webex events,video conferencing',
    'cisco_cucm':
        'cucm,callmanager,unified communications manager,ip telephony,voip,jabber,cdr,cmr',
    'cisco_meeting_server':
        'cms,cisco meeting server,acano,video conferencing,h323,webrtc,call bridge',
    'cisco_meeting_management':
        'meeting management,conference management,meeting control,recording,streaming',
    'cisco_tvcs':
        'tvcs,vcs,telepresence,video communication server,expressway,firewall traversal',
    'cisco_collab_hardware':
        'deskpro,board pro,room kit,navigator,roomos,people count,environmental sensors,collaboration hardware',
}


def main():
    with open(CONF, 'r') as f:
        text = f.read()

    # Split into stanza blocks (keep text before first stanza too)
    parts = re.split(r'(\n(?=\[))', text)  # split keeping delimiters
    # Re-join parts so each chunk is a full stanza or the header
    # Actually, let's use a different approach: find and replace field values
    
    changes = 0
    
    for product_id, new_sort in SORT_ORDER.items():
        # Find the stanza and update sort_order
        pattern = rf'(\[{re.escape(product_id)}\].*?)(sort_order\s*=\s*)\d+'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            old_val = re.search(r'sort_order\s*=\s*(\d+)', match.group(0))
            if old_val and int(old_val.group(1)) != new_sort:
                text = text[:match.start() + match.start(2) - match.start()] + \
                       text[match.start():].replace(
                           f'sort_order = {old_val.group(1)}',
                           f'sort_order = {new_sort}',
                           1
                       )
                changes += 1
        else:
            # No sort_order field — need to add one
            stanza_match = re.search(rf'\[{re.escape(product_id)}\]', text)
            if stanza_match:
                # Find end of stanza (next stanza or EOF)
                next_stanza = re.search(r'\n\[', text[stanza_match.end():])
                if next_stanza:
                    insert_pos = stanza_match.end() + next_stanza.start()
                else:
                    insert_pos = len(text)
                # Insert before the blank line before next stanza
                text = text[:insert_pos].rstrip('\n') + f'\nsort_order = {new_sort}\n' + text[insert_pos:]
                changes += 1
    
    for product_id, new_kw in KEYWORDS.items():
        # Find existing keywords line within the stanza
        # We need to find keywords = ... within a specific stanza
        stanza_start = text.find(f'[{product_id}]')
        if stanza_start == -1:
            print(f"  WARNING: stanza [{product_id}] not found")
            continue
        
        # Find end of this stanza
        next_stanza = re.search(r'\n\[', text[stanza_start + 1:])
        stanza_end = stanza_start + 1 + next_stanza.start() if next_stanza else len(text)
        stanza_text = text[stanza_start:stanza_end]
        
        kw_match = re.search(r'^keywords\s*=\s*(.+)$', stanza_text, re.MULTILINE)
        if kw_match:
            old_kw = kw_match.group(1).strip()
            if old_kw != new_kw:
                old_line = f'keywords = {old_kw}'
                new_line = f'keywords = {new_kw}'
                # Replace within the stanza region only
                new_stanza = stanza_text.replace(old_line, new_line, 1)
                text = text[:stanza_start] + new_stanza + text[stanza_end:]
                changes += 1
        else:
            print(f"  WARNING: no keywords field in [{product_id}]")
    
    with open(CONF, 'w') as f:
        f.write(text)
    
    print(f"\nDone — {changes} field(s) updated in products.conf")


if __name__ == '__main__':
    main()
