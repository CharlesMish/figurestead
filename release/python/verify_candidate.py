"""Read-only verification of the retained a2 bytes and their package-source inputs."""
import argparse
import email
import hashlib
import json
from pathlib import Path
import tarfile
import zipfile
ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.9.0a2'

def source_inputs(root):
    files = {root / p for p in ('pyproject.toml', 'MANIFEST.in', 'README.md', 'LICENSE', 'VERSIONING.md', 'docs/direct-series-labels.md', 'docs/rendered-series-contrast.md', 'docs/reference-themes.md', 'release/notes/0.9.0a2-web-alpha.3.md')}
    files.update((p for p in (root / 'src/figurestead').rglob('*') if p.suffix in ('.py', '.json')))
    files.update((p for p in (root / 'examples/direct-series-labels').iterdir() if p.is_file()))
    files.update((p for p in (root / 'docs/assets/reference-themes').rglob('*') if p.suffix in ('.png', '.json')))
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}

def verify(root=ROOT, check_source=False):
    release = root / 'release/python' / VERSION
    names = [f'figurestead-{VERSION}-py3-none-any.whl', f'figurestead-{VERSION}.tar.gz']
    dist = release / 'dist'
    if not sorted((p.name for p in dist.iterdir())) == sorted(names):
        raise ValueError('unexpected distributions')
    if not all(((dist / n).is_file() and (not (dist / n).is_symlink()) for n in names)):
        raise ValueError('nonregular distribution')
    digests = {n: hashlib.sha256((dist / n).read_bytes()).hexdigest() for n in names}
    if not (release / 'SHA256SUMS.txt').read_text() == ''.join((f'{digests[n]}  {n}\n' for n in names)):
        raise ValueError('artifact digest mismatch')
    binding = json.loads((release / 'SOURCE_INPUTS.json').read_text())
    current = binding['files']
    if not all(isinstance(p, str) and not p.startswith('/') and '..' not in Path(p).parts for p in current):
        raise ValueError('unsafe source input path')
    if not {'pyproject.toml', 'MANIFEST.in', 'README.md', 'LICENSE', 'VERSIONING.md'}.issubset(current):
        raise ValueError('missing source authority')
    if not binding['package'] == {'name': 'figurestead', 'version': VERSION}:
        raise ValueError('candidate verification failed')
    if check_source and not current == source_inputs(root):
        raise ValueError('source input identity mismatch')
    with zipfile.ZipFile(dist / names[0]) as wheel, tarfile.open(dist / names[1]) as sdist:
        if not wheel.testzip() is None:
            raise ValueError('candidate verification failed')
        members = {m.name: m for m in sdist.getmembers()}
        for path, digest in current.items():
            member = members[f'figurestead-{VERSION}/{path}']
            if not (member.isfile() and (not member.issym())):
                raise ValueError('candidate verification failed')
            if not hashlib.sha256(sdist.extractfile(member).read()).hexdigest() == digest:
                raise ValueError(f'sdist input {path}')
            if path.startswith('src/figurestead/'):
                if not hashlib.sha256(wheel.read(path[4:])).hexdigest() == digest:
                    raise ValueError(f'wheel input {path}')
        expected_wheel_sources = {p[4:] for p in current if p.startswith('src/figurestead/')}
        if not {n for n in wheel.namelist() if n.startswith('figurestead/')} == expected_wheel_sources:
            raise ValueError('wheel source inventory')
        readme = sdist.extractfile(members[f'figurestead-{VERSION}/README.md']).read().decode('utf-8').strip()
        for payload in (wheel.read(f'figurestead-{VERSION}.dist-info/METADATA'), sdist.extractfile(members[f'figurestead-{VERSION}/PKG-INFO']).read()):
            metadata = email.message_from_bytes(payload)
            if not (metadata['Name'] == 'figurestead' and metadata['Version'] == VERSION):
                raise ValueError('package identity')
            if not metadata.get_payload(decode=True).decode('utf-8').strip() == readme:
                raise ValueError('package README')
    return {'result': 'PASS', 'package': binding['package'], 'sourceInputs': len(current), 'sha256': digests}
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', choices=[VERSION], required=True)
    parser.add_argument('--check-source', action='store_true', help='Also compare preparation checkout inputs; historical artifacts do not require current main equality')
    args = parser.parse_args()
    print(json.dumps(verify(check_source=args.check_source), indent=2))
