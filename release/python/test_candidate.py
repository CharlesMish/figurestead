"""Disposable positive/negative checks of the retained Python artifact gate."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import tarfile
import unittest
import zipfile
from verify_candidate import ROOT, VERSION, verify, source_inputs


class CandidateIntegrity(unittest.TestCase):
    version = VERSION
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='figurestead-python-candidate-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.release = self.root / 'release/python' / self.version
        shutil.copytree(ROOT / 'release/python' / self.version, self.release)

    def test_retained_candidate(self):
        self.assertEqual(verify(self.root, version=self.version)['result'], 'PASS')

    def test_mutation_or_loss_rejects(self):
        wheel = next((self.release / 'dist').glob('*.whl'))
        wheel.write_bytes(wheel.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'digest mismatch'): verify(self.root, version=self.version)
        wheel.unlink()
        with self.assertRaisesRegex(ValueError, 'unexpected distributions'): verify(self.root, version=self.version)

    def test_source_binding_change_rejects(self):
        ledger = self.release / 'SOURCE_INPUTS.json'
        data = json.loads(ledger.read_text());data['files']['src/figurestead/plots.py'] = '0' * 64
        ledger.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'sdist input'): verify(self.root, version=self.version)

    def test_metadata_rebinding_cannot_bypass_identity(self):
        wheel = next((self.release / 'dist').glob('*.whl'))
        with zipfile.ZipFile(wheel) as z: members = {n:z.read(n) for n in z.namelist()}
        name = f'figurestead-{self.version}.dist-info/METADATA'
        members[name] = members[name].replace(f'Version: {self.version}'.encode(), b'Version: 0.9.0a1')
        with zipfile.ZipFile(wheel, 'w') as z:
            for n, data in members.items():z.writestr(n,data)
        sums = self.release / 'SHA256SUMS.txt';lines = sums.read_text().splitlines()
        lines[0] = hashlib.sha256(wheel.read_bytes()).hexdigest() + '  ' + wheel.name
        sums.write_text('\n'.join(lines)+'\n')
        with self.assertRaisesRegex(ValueError, 'package identity'): verify(self.root, version=self.version)


class HistoricalA2Integrity(CandidateIntegrity):
    version = '0.9.0a2'


class HistoricalA3Integrity(CandidateIntegrity):
    version = '0.9.0a3'


class SourceInventory(unittest.TestCase):
    version = '0.9.0a3'
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='figurestead-bound-source-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        release = self.root / 'release/python' / self.version
        shutil.copytree(ROOT / 'release/python' / self.version, release)
        # Authenticate frozen artifacts and their ledger before materializing
        # source. Moving checkout files are not historical release authority.
        self.assertEqual(verify(self.root, version=self.version)['result'], 'PASS')
        ledger = json.loads((release / 'SOURCE_INPUTS.json').read_text())
        with tarfile.open(release / 'dist' / f'figurestead-{self.version}.tar.gz') as archive:
            for name, digest in ledger['files'].items():
                payload = archive.extractfile(f'figurestead-{self.version}/{name}').read()
                self.assertEqual(hashlib.sha256(payload).hexdigest(), digest)
                target = self.root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
        self.assertEqual(verify(self.root, check_source=True, version=self.version)['result'], 'PASS')

    def test_new_docs_are_bound_without_redefining_a2(self):
        previous = source_inputs(self.root, '0.9.0a2')
        current = source_inputs(self.root, '0.9.0a3')
        self.assertEqual(set(current) - set(previous), {
            'docs/line-series-semantics.md', 'docs/sequential-heatmaps.md',
            'docs/histogram-medians.md', 'release/notes/0.9.0a3-web-alpha.4.md',
        })

    def test_frozen_source_matches_selected_version(self):
        self.assertEqual(verify(self.root, check_source=True, version=self.version)['result'], 'PASS')

    def test_source_change_rejects(self):
        (self.root / 'docs/line-series-semantics.md').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'source input identity'):
            verify(self.root, check_source=True, version=self.version)

    def test_later_readme_edit_preserves_retained_verification(self):
        with (self.root / 'README.md').open('a') as readme:
            readme.write('\nA harmless later documentation sentence.\n')
        self.assertEqual(verify(self.root, version=self.version)['result'], 'PASS')
        with self.assertRaisesRegex(ValueError, 'source input identity'):
            verify(self.root, check_source=True, version=self.version)


class CurrentSourceInventory(SourceInventory):
    version = VERSION

    def test_new_docs_are_bound_without_redefining_a3(self):
        previous = source_inputs(self.root, '0.9.0a3')
        current = source_inputs(self.root, VERSION)
        self.assertEqual(set(current) - set(previous), {
            'docs/categorical-matrix-domains.md', 'docs/svg-export-typography.md',
            'release/notes/0.9.0a4-web-alpha.5.md',
        })


if __name__ == '__main__':unittest.main()
