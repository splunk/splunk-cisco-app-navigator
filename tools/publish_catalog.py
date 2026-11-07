#!/usr/bin/env python3
"""Publish the catalog from an exact release package; default is check-only."""
import argparse
import configparser
from datetime import datetime
import json
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import tempfile

APP = 'splunk-cisco-app-navigator'
BUCKET = 'is4s'
KEY = 'scan/products.conf'
ACCOUNT = '424205266756'


def revision(content):
    lines = content.decode('utf-8').splitlines()
    match = re.fullmatch(r'# version = (\d{4}_\d{2}_\d{2}_\d{4})', lines[0] if lines else '')
    if not match:
        raise ValueError('Catalog must have a full stamped timestamp; source placeholders are not publishable')
    return datetime.strptime(match[1], '%Y_%m_%d_%H%M')


def package_catalog(path):
    with tarfile.open(path, 'r:gz') as archive:
        def read(name):
            members = [m for m in archive.getmembers() if m.name == f'{APP}/{name}']
            if len(members) != 1 or not members[0].isfile() or members[0].size > 10 * 1024 * 1024:
                raise ValueError(f'Invalid package member: {name}')
            return archive.extractfile(members[0]).read()
        catalog = read('default/products.conf')
        revision(catalog)
        conf = configparser.ConfigParser(interpolation=None)
        conf.read_string(read('default/app.conf').decode())
        version, build = conf['id']['version'], conf['install']['build']
        if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not build.isdigit():
            raise ValueError('Invalid packaged app identity')
        minimum = re.search(rb'^# min_app_version = (\d+\.\d+\.\d+)\s*$', catalog, re.M)
        if not minimum or tuple(map(int, minimum[1].decode().split('.'))) > tuple(map(int, version.split('.'))):
            raise ValueError('Missing or incompatible min_app_version')
        return catalog, version, build


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('--profile', default='catalog-publisher')
    parser.add_argument('--publish', action='store_true', help='Replace S3 object and verify contents; no backup')
    args = parser.parse_args()
    catalog, version, build = package_catalog(args.package)

    def aws(*command):
        login = 'aws sso login --profile ' + shlex.quote(args.profile)
        result = subprocess.run(['aws', *command, '--profile', args.profile, '--region', 'us-east-1',
                                 '--no-cli-pager', '--cli-connect-timeout', '10', '--cli-read-timeout', '30'],
                                capture_output=True, timeout=90)
        if result.returncode:
            detail = result.stderr.decode(errors='replace').lower()
            if any(word in detail for word in ('sso', 'expired', 'token', 'credentials', 'unauthorized', 'invalidclient')):
                raise ValueError(f'AWS authentication failed. Run:\n  {login}\nThen rerun this command.')
            if 'preconditionfailed' in detail or 'precondition failed' in detail:
                raise ValueError('S3 changed since the check. Nothing was overwritten by this request; rerun check-only mode.')
            if 'accessdenied' in detail or 'access denied' in detail:
                raise ValueError(f'AWS denied access. If your session expired, run:\n  {login}\nOtherwise confirm your role has access to s3://{BUCKET}/{KEY}.')
            raise ValueError(f'AWS request failed. Check network/VPN access. If authentication is stale, run:\n  {login}\nIf an upload was attempted, verify S3 before retrying.')
        return result.stdout

    identity = json.loads(aws('sts', 'get-caller-identity'))
    if identity['Account'] != ACCOUNT:
        raise ValueError('AWS profile points to the wrong account')
    with tempfile.TemporaryDirectory(prefix='navigator-publish-') as directory:
        local = Path(directory) / 'products.conf'
        remote = Path(directory) / 'remote.conf'
        metadata = json.loads(aws('s3api', 'get-object', '--bucket', BUCKET, '--key', KEY, str(remote)))
        previous = remote.read_bytes()
        if revision(catalog) <= revision(previous):
            raise ValueError('Package catalog is not newer than S3; build a package in a later UTC minute')
        print(f'Package: {args.package}\nApp: {version}, build {build}\nDestination: s3://{BUCKET}/{KEY}')
        print(f'Revision: {revision(previous)} -> {revision(catalog)} UTC')
        if not args.publish:
            print('Checks passed. Repeat with --publish to upload this package catalog.')
            return
        local.write_bytes(catalog)
        aws('s3api', 'put-object', '--bucket', BUCKET, '--key', KEY, '--body', str(local),
            '--content-type', 'text/plain', '--if-match', metadata['ETag'])
        aws('s3api', 'get-object', '--bucket', BUCKET, '--key', KEY, str(remote))
        if remote.read_bytes() != catalog:
            raise ValueError('Upload verification failed: S3 contents differ')
        print('Published and verified exact catalog contents.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, tarfile.TarError, configparser.Error, subprocess.TimeoutExpired) as error:
        if isinstance(error, FileNotFoundError) and error.filename == 'aws':
            raise SystemExit('ERROR: AWS CLI is missing. Install AWS CLI v2, then run aws configure sso --profile catalog-publisher.')
        raise SystemExit(f'ERROR: {error}')
