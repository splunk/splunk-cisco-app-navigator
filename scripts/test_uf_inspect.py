#!/usr/bin/env python3
import sys, types, os, tarfile, io, base64

os.chdir("/Users/akhamis/repo/cisco_enterprise_networking_app/packages/cisco-enterprise-networking-app")
sys.path.insert(0, "src/main/resources/splunk/bin")
ch = types.ModuleType("credential_helper")
ch.PASSWORD_PLACEHOLDER = "***"
ch.ucs_server_realm = lambda app: "ucs"
ch.store_credential = lambda *a, **k: True
sys.modules["credential_helper"] = ch

from dce_config_generator import DCEConfigGenerator
gen = DCEConfigGenerator("src/main/resources/splunk/master_library", "stage")
result = gen.generate_uf_package("cisco_asa", "TA_cisco_asa_uf")
tar_bytes = base64.b64decode(result["content_base64"])
with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
    for member in tar.getmembers():
        if member.name.endswith("props.conf"):
            f = tar.extractfile(member)
            print("=== props.conf ===")
            print(f.read().decode())
        if member.name.endswith("app.conf"):
            f = tar.extractfile(member)
            print("=== app.conf ===")
            print(f.read().decode())
