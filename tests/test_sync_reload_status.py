"""Exercise the actual sync generator without network or a Splunk runtime."""
import ast
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
from typing import Generator
import unittest
import os

SOURCE = Path(__file__).resolve().parents[1] / 'packages/splunk-cisco-app-navigator/src/main/resources/splunk/bin/synccatalog.py'
tree = ast.parse(SOURCE.read_text())
command = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'SyncCatalog')
generate = next(n for n in command.body if isinstance(n, ast.FunctionDef) and n.name == 'generate')


class SyncStatusTests(unittest.TestCase):
    def test_failed_reload_reports_partial_success_after_file_write(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'products.conf'
            destination.write_bytes(b'old')
            events = []
            class Response:
                status_code = 200
                content = b'new'
                def raise_for_status(self): pass
            ns = dict(Generator=Generator, time=time, os=os, DESTINATION_DIR=directory,
                      DESTINATION_FILE_NAME='products.conf', S3_BASE_URL='https://example.invalid/', S3_FILE_PATH='products.conf',
                      INFO=lambda *a: None, ERROR=lambda *a: None, WARN=lambda *a: None,
                      requests=SimpleNamespace(get=lambda *a, **kw: Response(), exceptions=SimpleNamespace(RequestException=RuntimeError)),
                      get_file_version=lambda content: 2 if content == b'new' else 1,
                      parse_min_app_version=lambda content: '', format_version_timestamp=str,
                      backup_existing_file=lambda path: None, prune_old_backups=lambda: None)
            exec(compile(ast.Module(body=[generate], type_ignores=[]), str(SOURCE), 'exec'), ns)
            def write(content):
                destination.write_bytes(content)
                return str(destination), len(content)
            subject = SimpleNamespace(dryrun=False, metadata=SimpleNamespace(searchinfo=SimpleNamespace(session_key='test', splunkd_uri='https://example.invalid')),
                                      write_output=write, reload_products_conf=lambda *a: {'status': 'Failed', 'message': 'certificate hostname mismatch'})
            rows = list(ns['generate'](subject))
            self.assertEqual(destination.read_bytes(), b'new')
            self.assertEqual(rows[0]['status'], 'Partial Success')
            self.assertEqual(rows[0]['reload_status'], 'Failed')
            self.assertIn('reload failed', rows[0]['reason'])


if __name__ == '__main__': unittest.main()
