"""Shared workflow protocol and offline recovery; no live dispatches or credentials."""
import concurrent.futures
import importlib.util
import io
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / 'tools/reserve_package_build.py'
spec = importlib.util.spec_from_file_location('reservation', TOOL)
reservation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reservation)


class SharedBuildTests(unittest.TestCase):
    def service(self):
        runs = []
        lock = threading.Lock()
        def api(method, endpoint, payload=None):
            if endpoint == '':
                return {'full_name': reservation.REPOSITORY, 'default_branch': 'develop'}
            if endpoint.endswith('.yml'):
                return {'id': 17, 'state': 'active', 'path': '.github/workflows/' + reservation.WORKFLOW}
            if method == 'POST':
                self.assertEqual(payload['ref'], 'develop')
                with lock:
                    n = len(runs) + 1
                    runs.append({'id': 100 + n, 'workflow_id': 17, 'event': 'workflow_dispatch',
                                 'run_number': n, 'display_title': reservation.PREFIX + payload['inputs']['request_id']})
                return None
            with lock:
                return {'workflow_runs': list(reversed(runs))}
        return api, runs

    def mock_service(self, api):
        return patch.object(reservation, 'github', side_effect=api)

    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.gh = patch.object(reservation.shutil, 'which', return_value='gh')
        self.gh.start()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.gh.stop)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'dist/build-reservations'

    def current(self):
        return json.loads((self.state / 'current.json').read_text())

    def test_concurrent_machines_get_distinct_server_numbers(self):
        api, runs = self.service()
        dirs = [self.root / str(i) for i in range(6)]
        with self.mock_service(api), concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            numbers = list(pool.map(lambda p: reservation.reserve_resilient(0, p), dirs))
        self.assertEqual(set(numbers), set(range(100, 106)))
        for directory, number in zip(dirs, numbers):
            state = json.loads((directory / 'current.json').read_text())
            run = next(r for r in runs if r['id'] == state['run_id'])
            self.assertEqual(state['build'], number)
            self.assertEqual(run['display_title'], reservation.PREFIX + state['request_id'])
            self.assertEqual(list(directory.iterdir()), [directory / 'current.json'])

    def test_missing_directory_deleted_file_and_corrupt_state_recover_shared_sequence(self):
        api, _ = self.service()
        with self.mock_service(api):
            self.assertEqual(reservation.reserve_resilient(0, self.state), 100)
            shutil.rmtree(self.state)
            self.assertEqual(reservation.reserve_resilient(0, self.state), 101)
            (self.state / 'current.json').unlink()
            self.assertEqual(reservation.reserve_resilient(0, self.state), 102)
            for text in ('{bad', '[]', 'null'):
                (self.state / 'current.json').write_text(text)
                number = reservation.reserve_resilient(0, self.state)
                self.assertGreater(number, 102)
            self.assertEqual([p.name for p in self.state.iterdir()], ['current.json'])

    def test_known_higher_state_and_floor_are_respected_without_local_increment(self):
        api, runs = self.service()
        reservation.save_current(self.state, {'build': 102})
        with self.mock_service(api):
            number = reservation.reserve_resilient(101, self.state)
        self.assertEqual(number, 103)
        self.assertEqual(len(runs), 4)  # 100, 101, 102 are genuinely spent, never invented.

    def test_consumed_claim_cannot_be_reused_and_only_one_concurrent_claim_wins(self):
        api, _ = self.service()
        with self.mock_service(api):
            number = reservation.reserve_resilient(0, self.state)
        def claim(_):
            try:
                reservation.claim_build(number, self.state)
                return True
            except reservation.ReservationError:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(claim, range(2))), 1)
        self.assertTrue(self.current()['claimed'])
        with self.assertRaisesRegex(reservation.ReservationError, 'already used'):
            reservation.claim_build(number, self.state)
        with self.assertRaises(reservation.ReservationError):
            reservation.claim_build(number + 1, self.state)

    def test_legacy_cleanup_preserves_higher_number_unrelated_files_and_packages(self):
        self.state.mkdir(parents=True)
        old = {'build': 101, 'run_number': 2, 'workflow_id': 17, 'run_id': 102,
               'request_id': 'a' * 32, 'usable': True}
        for name in ('101.json', '101.claimed'):
            (self.state / name).write_text(json.dumps(old))
        (self.state / '999.json').write_text('{"unrelated": true}')
        (self.state / 'notes.txt').write_text('keep')
        (self.state / '.current-notes').write_text('keep')
        package = self.state.parent / 'retained.tar.gz'
        package.write_bytes(b'keep')
        api, _ = self.service()
        with self.mock_service(api):
            self.assertEqual(reservation.reserve_resilient(0, self.state), 102)
        self.assertEqual({p.name for p in self.state.iterdir()}, {'current.json', '999.json', 'notes.txt', '.current-notes'})
        self.assertEqual(package.read_bytes(), b'keep')

    def test_atomic_replace_failure_preserves_old_state_and_cleans_temporary(self):
        reservation.save_current(self.state, {'build': 110})
        with patch.object(reservation.os, 'replace', side_effect=OSError('disk error')):
            with self.assertRaises(OSError):
                reservation.save_current(self.state, {'build': 111})
        self.assertEqual(self.current()['build'], 110)
        self.assertEqual([p.name for p in self.state.iterdir()], ['current.json'])

    def test_interrupted_atomic_write_floor_is_recovered_and_temporary_cleaned(self):
        self.state.mkdir(parents=True)
        (self.state / '.current-abcd1234').write_text('{"build": 102}')
        api, _ = self.service()
        with self.mock_service(api):
            self.assertEqual(reservation.reserve_resilient(0, self.state), 103)
        self.assertEqual([p.name for p in self.state.iterdir()], ['current.json'])

    def test_state_disk_failure_does_not_fall_back_to_manual_number(self):
        api, _ = self.service()
        with self.mock_service(api), patch.object(reservation.os, 'replace', side_effect=OSError('disk error')), patch.object(reservation, 'manual_reservation') as manual:
            with self.assertRaises(OSError):
                reservation.reserve_resilient(0, self.state)
            manual.assert_not_called()

    def archive(self, number, suffix):
        self.root.mkdir(exist_ok=True)
        path = self.root / (reservation.APP_ID + '-1.0.60-' + suffix)
        data = f'[install]\nbuild = {number}\n'.encode()
        with tarfile.open(path, 'w:gz') as archive:
            info = tarfile.TarInfo(reservation.APP_ID + '/default/app.conf')
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
        return path

    def test_source_release_installed_and_alternate_archive_metadata_floors(self):
        app = self.root / 'app.conf'; app.write_text('[install]\nbuild = 100\n')
        floor = self.root / 'BUILD_NUMBER_FLOOR'; floor.write_text('101\n')
        installed = self.root / 'installed.conf'; installed.write_text('[install]\nbuild = 104\n')
        self.archive(102, 'misleading-minified.tar.gz')
        self.archive(103, 'alternate.tgz')
        self.assertEqual(reservation.local_floor(app, floor, self.root, reservation.APP_ID, installed), 104)
        installed.unlink()
        self.assertEqual(reservation.local_floor(app, floor, self.root, reservation.APP_ID), 103)
        api, _ = self.service()
        with self.mock_service(api):
            self.assertEqual(reservation.reserve_resilient(104, self.state), 105)

    def test_bad_archive_or_metadata_is_not_treated_as_a_shared_outage(self):
        app = self.root / 'app.conf'; app.write_text('[install]\nbuild = nope\n')
        with self.assertRaises(reservation.ReservationError):
            reservation.local_floor(app, self.root/'floor', self.root, reservation.APP_ID)
        app.write_text('[install]\nbuild = 0\n')
        (self.root / (reservation.APP_ID + '-bad.tar.gz')).write_bytes(b'bad')
        with self.assertRaisesRegex(reservation.ReservationError, 'archive'):
            reservation.local_floor(app, self.root/'floor', self.root, reservation.APP_ID)

    def test_explicit_override_is_honored_even_when_shared_service_is_available(self):
        api, runs = self.service()
        with self.mock_service(api), patch.dict(os.environ, {reservation.MANUAL_ENV: '150'}):
            self.assertEqual(reservation.reserve_resilient(120, self.state), 150)
        self.assertEqual(runs, [])
        self.assertEqual(self.current()['backend'], 'manual')
        reservation.claim_build(150, self.state)
        with self.assertRaises(reservation.ReservationError):
            reservation.claim_build(150, self.state)

    def test_override_rejects_noninteger_floor_and_consumed_manual_numbers(self):
        for raw in ('120', '0', '-1', '1.5', 'abc', ' 121', ''):
            with patch.dict(os.environ, {reservation.MANUAL_ENV: raw}), patch.object(reservation, 'shared_floor', return_value=120):
                with self.assertRaises(reservation.ReservationError):
                    reservation.reserve_resilient(0, self.state)
        reservation.save_current(self.state, {'build': 151, 'claimed': True})
        with patch.dict(os.environ, {reservation.MANUAL_ENV: '151'}), patch.object(reservation, 'shared_floor', side_effect=reservation.ReservationError('offline')):
            with self.assertRaises(reservation.ReservationError):
                reservation.reserve_resilient(0, self.state)

    def test_manual_offline_override_and_unattended_no_override(self):
        for reason in ('authentication unavailable', 'network timeout', 'Actions disabled'):
            with patch.object(reservation, 'github', side_effect=reservation.ReservationError(reason)), patch.dict(os.environ, {reservation.MANUAL_ENV: '130'}):
                self.assertEqual(reservation.reserve_resilient(125, self.state), 130)
            (self.state / 'current.json').unlink()
        with patch.object(reservation, 'github', side_effect=reservation.ReservationError('offline')), patch.dict(os.environ, {'CI': 'true'}):
            with self.assertRaisesRegex(reservation.ReservationError, 'NAVIGATOR_BUILD_NUMBER.*greater than 125'):
                reservation.reserve_resilient(125, self.state)

    def test_lost_dispatch_response_is_not_redispatched_and_spent_number_is_floor(self):
        api, runs = self.service()
        def fail(method, endpoint, payload=None):
            result = api(method, endpoint, payload)
            if method == 'POST':
                raise reservation.ReservationError('Lost response')
            return result
        with self.mock_service(fail), patch.object(reservation, 'manual_reservation', return_value=101) as manual:
            self.assertEqual(reservation.reserve_resilient(0, self.state), 101)
        self.assertEqual(len(runs), 1)
        self.assertEqual(manual.call_args.args[0], 100)

    def test_inactive_or_malformed_service_uses_manual_without_dispatch(self):
        for inactive in (True, False):
            api, runs = self.service()
            def unavailable(method, endpoint, payload=None):
                result = api(method, endpoint, payload)
                if endpoint.endswith('.yml'):
                    return {**result, 'state': 'disabled_manually'} if inactive else None
                return result
            with self.mock_service(unavailable), patch.object(reservation, 'manual_reservation', return_value=123) as manual:
                self.assertEqual(reservation.reserve_resilient(122, self.state), 123)
                manual.assert_called_once()
            self.assertEqual(runs, [])

    def test_bounded_catchup_preserves_floor_and_offers_manual(self):
        api, runs = self.service()
        with self.mock_service(api), patch.object(reservation, 'manual_reservation', return_value=201) as manual:
            self.assertEqual(reservation.reserve_resilient(200, self.state), 201)
        self.assertEqual(len(runs), reservation.MAX_CATCHUP)
        self.assertEqual(manual.call_args.args[0], 200)
        self.assertEqual(reservation.local_state_floor(self.state), 200)

    def test_timeout_does_not_guess_or_redispatch(self):
        api, runs = self.service()
        def hidden(method, endpoint, payload=None):
            result = api(method, endpoint, payload)
            return {'workflow_runs': []} if '/runs?' in endpoint else result
        with self.mock_service(hidden), patch.object(reservation.time, 'monotonic', side_effect=[0, 1, 121]), patch.object(reservation.time, 'sleep'):
            with self.assertRaisesRegex(reservation.ReservationError, 'not visible'):
                reservation.reserve_build(0, self.state)
        self.assertEqual(len(runs), 1)
        self.assertFalse((self.state / 'current.json').exists())

    def test_gh_errors_do_not_echo_credentials(self):
        with patch.object(reservation.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'secret-token')):
            with self.assertRaises(reservation.ReservationError) as caught:
                reservation.github('GET', '')
        self.assertNotIn('secret-token', str(caught.exception))

    def package_fixture(self):
        pkg = self.root / 'packages' / reservation.APP_ID
        scripts = pkg / 'bin'; scripts.mkdir(parents=True)
        for name in ('package_app.sh', 'stamp_version.sh', 'stamp_catalog.py'):
            shutil.copy(ROOT / 'packages' / reservation.APP_ID / 'bin' / name, scripts / name)
        (scripts / 'clean_build.sh').write_text('exit 17\n')
        (self.root / 'tools').mkdir()
        shutil.copy(TOOL, self.root / 'tools' / TOOL.name)
        (self.root / 'VERSION').write_text('1.0.60\n')
        stage = pkg / 'stage/default'; stage.mkdir(parents=True)
        (stage / 'app.conf').write_text('[install]\nbuild = 0\n[id]\nversion = 0.0.0\n')
        (stage / 'products.conf').write_text('# version = __CATALOG_VERSION__\n# min_app_version = 1.0.26\n')
        tools = self.root / 'fake-bin'; tools.mkdir()
        (tools / 'gh').write_text('#!/bin/sh\nexit 1\n'); (tools / 'gh').chmod(0o755)
        (tools / 'python3').symlink_to(sys.executable)
        env = {'PATH': str(tools) + ':/usr/bin:/bin:/usr/sbin:/sbin', 'CI': 'true',
               'SPLUNK_HOME': str(self.root / 'splunk'), 'NAVIGATOR_BUILD_NUMBER': '152'}
        return scripts / 'package_app.sh', env

    def test_real_package_pipeline_offline_override_name_claim_floor_and_reuse(self):
        script, env = self.package_fixture()
        target = self.root / 'splunk/etc/apps' / reservation.APP_ID / 'default'
        target.mkdir(parents=True); (target / 'app.conf').write_text('[install]\nbuild = 151\n')
        def run():
            return subprocess.run(['bash', str(script), '--from-stage'], env=env, capture_output=True, text=True, timeout=20)
        first = run()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        archive = self.root / 'dist' / (reservation.APP_ID + '-1.0.60-152.tar.gz')
        original = archive.read_bytes()
        with tarfile.open(archive) as tar:
            self.assertIn(b'build = 152', tar.extractfile(reservation.APP_ID + '/default/app.conf').read())
        self.assertEqual(self.current()['backend'], 'manual')
        self.assertTrue(self.current()['claimed'])
        self.assertEqual([p.name for p in self.state.iterdir()], ['current.json'])
        second = run()
        self.assertNotEqual(second.returncode, 0)
        self.assertIn('greater than 152', second.stderr)
        self.assertEqual(archive.read_bytes(), original)
        # Recreate a missing state directory; retained archive still forbids reuse.
        shutil.rmtree(self.state)
        self.assertNotEqual(run().returncode, 0)
        env['NAVIGATOR_BUILD_NUMBER'] = '153'
        self.assertEqual(run().returncode, 0)
        (self.root / 'VERSION').write_text('2.0.0\n')
        self.assertNotEqual(run().returncode, 0)  # The same number is spent across versions.
        env['NAVIGATOR_BUILD_NUMBER'] = '154'
        self.assertEqual(run().returncode, 0)
        self.assertTrue((self.root / 'dist' / (reservation.APP_ID + '-2.0.0-154.tar.gz')).is_file())
        self.assertFalse((self.root / 'dist' / ('.' + reservation.APP_ID + '-build.lock')).exists())

    def test_unattended_cli_without_override_exits_with_actionable_instruction(self):
        script, env = self.package_fixture()
        del env['NAVIGATOR_BUILD_NUMBER']
        result = subprocess.run(['bash', str(script), '--from-stage'], env=env, capture_output=True, text=True, timeout=20, start_new_session=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('NAVIGATOR_BUILD_NUMBER', result.stderr)
        self.assertFalse((self.state / 'current.json').exists())

    def test_packaging_failure_spends_claim_and_does_not_reuse_manual_number(self):
        script, env = self.package_fixture()
        tar = self.root / 'fake-bin/tar'
        tar.write_text('#!/bin/sh\nexit 19\n'); tar.chmod(0o755)
        result = subprocess.run(['bash', str(script), '--from-stage'], env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 19)
        self.assertTrue(self.current()['claimed'])
        tar.unlink()
        result = subprocess.run(['bash', str(script), '--from-stage'], env=env, capture_output=True, text=True, timeout=20)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('greater than 152', result.stderr)

    def test_package_lock_precedes_stage_changes_and_compile_errors_do_not_fall_back(self):
        script, env = self.package_fixture()
        dist = self.root / 'dist'; dist.mkdir()
        lock = dist / ('.' + reservation.APP_ID + '-build.lock'); lock.mkdir()
        result = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, timeout=20)
        self.assertIn('another package operation', result.stderr)
        self.assertTrue(lock.is_dir())
        lock.rmdir()
        result = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 17)
        self.assertFalse(self.state.exists())
        self.assertFalse(lock.exists())

    def test_rejected_reservation_retains_higher_known_floor_after_interruption(self):
        api, _ = self.service()
        reservation.save_current(self.state, {'build': 105})
        with self.mock_service(api):
            with self.assertRaises(reservation.BelowFloor):
                reservation.reserve_build(105, self.state)
        self.assertEqual(reservation.local_state_floor(self.state), 105)
        self.assertFalse(self.current()['usable'])
        with self.assertRaises(reservation.ReservationError):
            reservation.claim_build(100, self.state)

    @unittest.skipUnless(os.name == 'posix', 'controlling terminal is POSIX')
    def test_prompt_is_visible_on_tty_even_when_build_wrapper_captures_output(self):
        log = self.root / 'captured.log'
        code = f'''import importlib.util, contextlib
from pathlib import Path
s=importlib.util.spec_from_file_location('r', {str(TOOL)!r}); r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
def offline(*args, **kwargs): raise r.ReservationError('offline')
r.github=offline
with open({str(log)!r}, 'w') as output, contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
 print(r.reserve_resilient(120, Path({str(self.state)!r})))
'''
        if sys.platform == 'darwin':
            command = ['/usr/bin/script', '-q', '/dev/null', sys.executable, '-c', code]
        else:
            import shlex
            command = ['script', '-q', '-c', shlex.join([sys.executable, '-c', code]), '/dev/null']
        child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, start_new_session=True, env={'PATH': '/usr/bin:/bin'})
        try:
            data = b''; deadline = time.monotonic() + 10
            while b'other developers: ' not in data and time.monotonic() < deadline:
                ready, _, _ = select.select([child.stdout], [], [], 0.2)
                if ready:
                    chunk = os.read(child.stdout.fileno(), 4096)
                    if not chunk: break
                    data += chunk
            self.assertIn(b'greater than 120', data)
            self.assertIn(b'Global uniqueness cannot be verified', data)
            child.stdin.write(b'121\n'); child.stdin.flush()
            self.assertEqual(child.wait(timeout=5), 0)
        finally:
            if child.poll() is None:
                child.kill(); child.wait(timeout=5)
            child.stdin.close(); child.stdout.close()
        self.assertTrue(log.read_text().endswith('121\n'))
        self.assertEqual(self.current()['backend'], 'manual')



if __name__ == '__main__':
    unittest.main()
