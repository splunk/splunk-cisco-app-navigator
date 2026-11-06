"""Validate recommendations against a supplied Essentials release archive.

Usage: python tests/validate_essentials_coverage.py /path/to/essentials.tar.gz
This verifies packaged search/view evidence, not live ingestion or field quality.
"""
import configparser
import json
from pathlib import Path
import re
import sys
import tarfile


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / "tests/fixtures/essentials-coverage.json").read_text())
CONF = ROOT / "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf"


def splunk_conf(text):
    result = {}
    current = None
    key = None
    for line in text.splitlines():
        if line.startswith("[") and line.endswith("]"):
            current = result.setdefault(line[1:-1], {})
            key = None
        elif current is not None and line and not line.startswith("#"):
            match = re.match(r"^([\w.-]+)\s*=\s*(.*)", line)
            if match:
                key = match[1]
                current[key] = match[2]
            elif key:
                current[key] += "\n" + line
    return result


def validate(archive):
    catalog = configparser.ConfigParser(interpolation=None)
    catalog.read(CONF)
    declared = {p for p in catalog if catalog[p].get("essentials_dashboards")}
    assert declared == set(FIXTURE["products"])
    with tarfile.open(archive) as package:
        prefix = "splunk-cisco-dashboards/"
        searches = splunk_conf(package.extractfile(prefix + "default/searchbase.conf").read().decode())
        names = set(package.getnames())
        for product, evidence in FIXTURE["products"].items():
            stanza = catalog[product]
            assert stanza["status"] == "active"
            assert stanza["essentials_dashboards"].split(",") == evidence["dashboards"]
            for view in evidence["dashboards"]:
                assert prefix + "default/data/ui/views/" + view + ".xml" in names, (product, view)
            patterns = [re.compile(r"(?<![\w:])" + re.escape(t).replace(r"\*", r"[\w:.-]*") + r"(?![\w:])")
                        for t in stanza["sourcetypes"].split(",")]
            for name in evidence["evidence_searches"]:
                assert name not in {"admin_macro_index_tuning", "executive_dashboard_data_source_status",
                                    "secure_networking_source_health_by_pillar"}
                assert any(p.search(searches[name]["search"]) for p in patterns), (product, name)
    print(f"PASS: {len(declared)} recommendations have packaged search evidence and valid view targets")


if __name__ == "__main__":
    validate(sys.argv[1])
