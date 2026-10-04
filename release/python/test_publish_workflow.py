"""Read-only checks that Python publication still binds the retained bytes."""
from collections import Counter
import hashlib
from pathlib import Path
import re
import unittest

from verify_candidate import ROOT, VERSION


def verify_workflow(text):
    release = ROOT / "release/python" / VERSION
    names = [f"figurestead-{VERSION}-py3-none-any.whl", f"figurestead-{VERSION}.tar.gz"]
    expected = Counter({
        (hashlib.sha256((release / "SOURCE_INPUTS.json").read_bytes()).hexdigest(),
         f"release/python/{VERSION}/SOURCE_INPUTS.json"): 1,
    })
    for name in names:
        expected[(hashlib.sha256((release / "dist" / name).read_bytes()).hexdigest(), f"dist/{name}")] = 2
    actual = Counter(re.findall(r'echo "([0-9a-f]{64})  ([^"\n]+)" \| sha256sum --check -', text))
    if actual != expected:
        raise ValueError("workflow exact-byte bindings differ from retained candidate")
    if set(re.findall(r"0\.9\.0a[0-9]+", text)) != {VERSION}:
        raise ValueError("workflow version identity differs")
    gates = text.split("  publish-testpypi:", 1)[0]
    production = text.split("  publish-pypi:", 1)[1].split("  verify-pypi:", 1)[0]
    for guard in ('test "$GITHUB_REPOSITORY" = "CharlesMish/figurestead"',
                  'test "$GITHUB_REF" = "refs/heads/main"',
                  'test "$REF_PROTECTED" = "true"',
                  'test "$GITHUB_SHA" = "$EXPECTED_COMMIT"',
                  'test "$CONFIRMATION" = "$expected_confirmation"',
                  f"python release/python/verify_candidate.py --version {VERSION}"):
        if guard not in gates:
            raise ValueError("unprivileged candidate guard missing")
    if "id-token: write" in gates:
        raise ValueError("unprivileged gate gained publication authority")
    if "      - require-testpypi-before-pypi\n" not in production:
        raise ValueError("production no longer requires identical TestPyPI bytes")
    if text.count("skip-existing: false") != 2 or text.count("id-token: write") != 2:
        raise ValueError("publication authority or retry boundary changed")
    if "python -m build" in text or "pip wheel" in text:
        raise ValueError("publication workflow must not rebuild")


class PythonPublicationBinding(unittest.TestCase):
    def setUp(self):
        self.text = (ROOT / ".github/workflows/publish-python.yml").read_text()

    def test_exact_candidate_and_existing_authority_gates(self):
        verify_workflow(self.text)

    def test_changed_ledger_or_distribution_hash_rejects(self):
        hashes = re.findall(r'echo "([0-9a-f]{64})  ', self.text)
        for digest in set(hashes):
            with self.subTest(digest=digest), self.assertRaisesRegex(ValueError, "exact-byte"):
                verify_workflow(self.text.replace(digest, "0" * 64))

    def test_wrong_version_path_rejects(self):
        with self.assertRaisesRegex(ValueError, "exact-byte"):
            verify_workflow(self.text.replace(f"dist/figurestead-{VERSION}.tar.gz", "dist/other.tar.gz"))

    def test_missing_production_testpypi_gate_rejects(self):
        with self.assertRaisesRegex(ValueError, "requires identical TestPyPI"):
            verify_workflow(self.text.replace("      - require-testpypi-before-pypi\n", ""))

    def test_missing_protected_main_guard_rejects(self):
        with self.assertRaisesRegex(ValueError, "guard missing"):
            verify_workflow(self.text.replace('test "$REF_PROTECTED" = "true"', ":"))


if __name__ == "__main__":
    unittest.main()
