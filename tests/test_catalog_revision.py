"""Catalog publication and legacy synccatalog timestamp compatibility."""
import ast
from datetime import datetime, timezone
import importlib.util
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'packages/splunk-cisco-app-navigator'
spec = importlib.util.spec_from_file_location('stamp_catalog', PKG / 'bin/stamp_catalog.py')
stamp_catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stamp_catalog)

# Load the real parser without importing the Splunk runtime or contacting S3.
source = (PKG / 'src/main/resources/splunk/bin/synccatalog.py').read_text()
tree = ast.parse(source)
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('get_file_version', 'format_version_timestamp')]
namespace = {'re': re, 'datetime': datetime, 'INFO': lambda *a: None, 'DEBUG': lambda *a: None, 'WARN': lambda *a: None, 'ERROR': lambda *a: None}
exec(compile(ast.Module(body=functions, type_ignores=[]), 'synccatalog.py', 'exec'), namespace)


class CatalogRevisionTests(unittest.TestCase):
    def test_stamp_changes_only_header_and_sync_parser_orders_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'products.conf'
            original = b'# version = 2026_11_05_1800\n# min_app_version = 1.0.13\n[example]\nname = Example\n'
            path.write_bytes(original)
            version = stamp_catalog.stamp(path, datetime(2026, 11, 6, 19, 5, tzinfo=timezone.utc))
            result = path.read_bytes()
            self.assertEqual(version, '2026_11_06_1905')
            self.assertEqual(result.split(b'\n', 1)[1], original.split(b'\n', 1)[1])
            parse = namespace['get_file_version']
            self.assertGreater(parse(result), parse(original))
            self.assertEqual(namespace['format_version_timestamp'](parse(result)), 'November 06, 2026, 07:05 PM UTC')
            self.assertFalse(parse(original) > parse(result))
            self.assertFalse(parse(result) > parse(result))  # Equal revisions do not trigger an update.

    def test_same_minute_or_older_does_not_modify_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'products.conf'
            content = b'# version = 2026_11_06_1905\n[example]\n'
            path.write_bytes(content)
            for minute in (4, 5):
                with self.assertRaises(ValueError):
                    stamp_catalog.stamp(path, datetime(2026, 11, 6, 19, minute, tzinfo=timezone.utc))
                self.assertEqual(path.read_bytes(), content)

    def test_build_does_not_modify_catalog_header(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pkg = root / 'packages/splunk-cisco-app-navigator'
            (pkg / 'bin').mkdir(parents=True)
            (pkg / 'node_modules/glob').mkdir(parents=True)
            (pkg / 'node_modules/glob/index.js').write_text('exports.sync = () => [];\n')
            shutil.copy(PKG / 'bin/build.js', pkg / 'bin/build.js')
            catalog = pkg / 'src/main/resources/splunk/default/products.conf'
            catalog.parent.mkdir(parents=True)
            original = b'# version = 2026_11_05_1800\n# min_app_version = 1.0.13\n[example]\n'
            catalog.write_bytes(original)
            # A no-op catalog generator and webpack keep the check local and avoid a Splunk instance.
            (pkg / 'bin/generate-catalog.js').write_text('')
            fakebin = root / 'fakebin'
            fakebin.mkdir()
            for name in ('npx', 'curl'):
                command = fakebin / name
                command.write_text('#!/bin/sh\nexit 0\n')
                command.chmod(0o755)
            env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'], SPLUNK_HOME=str(root / 'no-splunk'), NODE_OPTIONS='--max-old-space-size=4096')
            for _ in range(2):
                subprocess.run(['node', str(pkg / 'bin/build.js'), 'build'], env=env, check=True, capture_output=True, text=True, timeout=20)
                self.assertEqual(catalog.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
