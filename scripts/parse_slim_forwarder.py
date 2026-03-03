#!/usr/bin/env python3
"""
Parse SLIM conf.spec files to extract properties that have @placement forwarder.
Outputs a JSON registry mapping conf_file -> list of property key patterns
that should be included in a Universal Forwarder deployment package.
"""
import json
import re
import sys
from pathlib import Path

SPEC_DIR = Path.home() / ".local/pipx/venvs/splunk-packaging-toolkit/lib/python3.12/site-packages/slim/config/conf-specs"

# Conf files relevant to our products
RELEVANT_SPECS = [
    "props.conf.spec",
    "inputs.conf.spec",
    "transforms.conf.spec",
    "outputs.conf.spec",
]


def parse_spec_for_forwarder_keys(spec_path: Path) -> dict:
    """
    Parse a SLIM .conf.spec file and extract property keys whose
    @placement includes 'forwarder'.

    Returns dict with:
      - forwarder_keys: list of property key names/patterns
      - placements: dict mapping key -> full placement string
    """
    lines = spec_path.read_text().splitlines()
    current_placement = None
    current_stanza = None
    forwarder_keys = []
    placements = {}

    for line in lines:
        stripped = line.strip()

        # Track @placement directives
        if stripped.startswith("@placement"):
            placement_str = stripped[len("@placement"):].strip()
            current_placement = placement_str
            continue

        # Track stanza headers
        if stripped.startswith("[") and "]" in stripped:
            current_stanza = stripped.split("]")[0] + "]"
            continue

        # Skip comments and blank lines
        if not stripped or stripped.startswith("#"):
            continue

        # Extract property key = value lines
        match = re.match(r'^([A-Za-z_][A-Za-z0-9_\-.*<>{}]*)\s*=', stripped)
        if match and current_placement and "forwarder" in current_placement:
            key = match.group(1)
            forwarder_keys.append(key)
            placements[key] = current_placement

    return {
        "forwarder_keys": sorted(set(forwarder_keys)),
        "placements": placements,
    }


def main():
    registry = {}
    for spec_name in RELEVANT_SPECS:
        spec_path = SPEC_DIR / spec_name
        if not spec_path.exists():
            print(f"SKIP: {spec_name} not found", file=sys.stderr)
            continue
        conf_name = spec_name.replace(".spec", "")
        result = parse_spec_for_forwarder_keys(spec_path)
        if result["forwarder_keys"]:
            registry[conf_name] = result
            print(f"\n=== {conf_name} ({len(result['forwarder_keys'])} forwarder keys) ===")
            for key in result["forwarder_keys"]:
                print(f"  {key:40s} → {result['placements'][key]}")

    # Write registry JSON
    output = {}
    for conf_name, data in registry.items():
        output[conf_name] = {
            k: data["placements"][k] for k in data["forwarder_keys"]
        }
    out_path = Path("/tmp/forwarder_placement_registry.json")
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\n✓ Registry written to {out_path}")


if __name__ == "__main__":
    main()
