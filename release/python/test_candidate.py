"""Disposable positive/negative checks of the retained Python artifact gate."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile
from verify_candidate import ROOT, VERSION, verify


class CandidateIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='figurestead-python-candidate-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.release = self.root / 'release/python' / VERSION
        shutil.copytree(ROOT / 'release/python' / VERSION, self.release)

    def test_retained_candidate(self):
        self.assertEqual(verify(self.root)['result'], 'PASS')

    def test_mutation_or_loss_rejects(self):
        wheel = next((self.release / 'dist').glob('*.whl'))
        wheel.write_bytes(wheel.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'digest mismatch'): verify(self.root)
        wheel.unlink()
        with self.assertRaisesRegex(ValueError, 'unexpected distributions'): verify(self.root)

    def test_source_binding_change_rejects(self):
        ledger = self.release / 'SOURCE_INPUTS.json'
        data = json.loads(ledger.read_text());data['files']['src/figurestead/plots.py'] = '0' * 64
        ledger.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'sdist input'): verify(self.root)

    def test_metadata_rebinding_cannot_bypass_identity(self):
        wheel = next((self.release / 'dist').glob('*.whl'))
        with zipfile.ZipFile(wheel) as z: members = {n:z.read(n) for n in z.namelist()}
        name = f'figurestead-{VERSION}.dist-info/METADATA'
        members[name] = members[name].replace(b'Version: 0.9.0a2', b'Version: 0.9.0a1')
        with zipfile.ZipFile(wheel, 'w') as z:
            for n, data in members.items():z.writestr(n,data)
        sums = self.release / 'SHA256SUMS.txt';lines = sums.read_text().splitlines()
        lines[0] = hashlib.sha256(wheel.read_bytes()).hexdigest() + '  ' + wheel.name
        sums.write_text('\n'.join(lines)+'\n')
        with self.assertRaisesRegex(ValueError, 'package identity'): verify(self.root)


if __name__ == '__main__':unittest.main()
