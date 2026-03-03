#!/usr/bin/env python3
"""Quick test of the generate_uf_package method."""
import sys, json, types, os, tarfile, io, base64

os.chdir("/Users/akhamis/repo/cisco_enterprise_networking_app/packages/cisco-enterprise-networking-app")
sys.path.insert(0, "src/main/resources/splunk/bin")

# Mock credential_helper
ch = types.ModuleType("credential_helper")
ch.PASSWORD_PLACEHOLDER = "***"
ch.ucs_server_realm = lambda app: "ucs"
ch.store_credential = lambda *a, **k: True
sys.modules["credential_helper"] = ch

from dce_config_generator import DCEConfigGenerator

gen = DCEConfigGenerator(
    product_library_path="src/main/resources/splunk/master_library",
    splunk_app_path="stage",
)

products = ["cisco_asa", "cisco_dc_networking", "cisco_meraki", "cisco_ucs", "cisco_webex"]

for pid in products:
    result = gen.generate_uf_package(pid)
    print(f"=== {pid} ===")
    print(f"  Success: {result['success']}")
    print(f"  Package: {result.get('filename')}")
    print(f"  Size: {result.get('size_bytes')} bytes")
    print(f"  Confs: {result.get('generated_confs')}")
    if result.get("error"):
        print(f"  Error: {result['error']}")

    # Decode and peek inside the tarball
    if result.get("content_base64"):
        tar_bytes = base64.b64decode(result["content_base64"])
        with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
            for member in tar.getmembers():
                print(f"  -> {member.name}  ({member.size} bytes)")
    print()
