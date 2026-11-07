import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).resolve().parents[1] / 'tools/publish_catalog.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublishTests(unittest.TestCase):
    def test_check_publish_and_authentication_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / 'app.tar.gz'
            catalog = b'# version = 2026_11_07_1900\n# min_app_version = 1.0.33\n[example]\n'
            with tarfile.open(package, 'w:gz') as tar:
                for name, data in [('products.conf', catalog), ('app.conf', b'[id]\nversion=1.0.33\n[install]\nbuild=106\n')]:
                    member = tarfile.TarInfo(publisher.APP + '/default/' + name)
                    member.size = len(data)
                    tar.addfile(member, io.BytesIO(data))
            calls = []
            uploaded = False
            def aws(command, **kwargs):
                nonlocal uploaded
                calls.append(command)
                if 'get-caller-identity' in command:
                    result = {'Account': publisher.ACCOUNT}
                elif 'get-object' in command:
                    index = command.index('--profile') - 1
                    Path(command[index]).write_bytes(catalog if uploaded else b'# version = 2026_08_01_2130\n')
                    result = {'ETag': 'original-etag'}
                else:
                    self.assertIn('--if-match', command)
                    self.assertEqual(command[command.index('--if-match') + 1], 'original-etag')
                    uploaded = True
                    result = {}
                return subprocess.CompletedProcess(command, 0, json.dumps(result).encode(), b'')
            with patch.object(sys, 'argv', ['publish', str(package)]), patch.object(publisher.subprocess, 'run', side_effect=aws):
                publisher.main()
            self.assertFalse(uploaded)
            with patch.object(sys, 'argv', ['publish', str(package), '--publish']), patch.object(publisher.subprocess, 'run', side_effect=aws):
                publisher.main()
            self.assertTrue(uploaded)
            with patch.object(sys, 'argv', ['publish', str(package)]), patch.object(publisher.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'', b'SSO token expired')):
                with self.assertRaisesRegex(ValueError, 'aws sso login --profile catalog-publisher'):
                    publisher.main()

    def test_source_placeholder_is_rejected(self):
        with self.assertRaises(ValueError):
            publisher.revision(b'# version = __CATALOG_VERSION__\n')


if __name__ == '__main__':
    unittest.main()
