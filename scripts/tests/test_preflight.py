import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("preflight", Path(__file__).parents[1] / "preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in preflight.REQUIRED:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()

    def scan(self):
        with patch.object(preflight.shutil, "which", return_value="/test/tool"):
            return preflight.scan(self.root)

    def test_local_checkout_passes_without_reading_contents(self):
        with patch.object(Path, "read_text", side_effect=AssertionError("must not read contents")):
            self.assertTrue(self.scan()["ok"])

    def test_missing_manifest_fails(self):
        (self.root / "frontend/package.json").unlink()
        result = self.scan()
        self.assertFalse(result["ok"])
        self.assertIn("frontend/package.json", result["missing"])

    def test_dataless_source_and_git_are_reported(self):
        path = self.root / ".git/index"
        path.parent.mkdir()
        path.touch()
        original = Path.stat

        def cloud_stat(path, *args, **kwargs):
            info = original(path, *args, **kwargs)
            if path.name in {"package.json", "index"}:
                return SimpleNamespace(st_flags=preflight.SF_DATALESS, st_mode=info.st_mode)
            return info

        with patch.object(Path, "stat", cloud_stat):
            result = self.scan()
        self.assertFalse(result["ok"])
        self.assertEqual(result["git_placeholder_count"], 1)
        self.assertEqual(sorted(result["source_placeholders"]),
                         ["blockchain/package.json", "frontend/package.json", "package.json",
                          "packages/contracts/package.json", "subgraph/package.json"])

    def test_private_and_generated_files_are_excluded(self):
        for name in (".env", "frontend/.env.local", "node_modules/big.js", "blockchain/cache/solc.json"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        self.assertEqual(self.scan()["checked_files"], len(preflight.REQUIRED))

    def test_directory_symlinks_are_not_followed(self):
        (self.root / "recursive").symlink_to(self.root, target_is_directory=True)
        self.assertTrue(self.scan()["ok"])

    def test_authored_types_are_checked_and_generated_types_are_excluded(self):
        for name in ("frontend/src/types/api.ts", "blockchain/types/ethers-contracts/index.ts"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        self.assertEqual(self.scan()["checked_files"], len(preflight.REQUIRED) + 1)

    def test_missing_runtime_fails(self):
        with patch.object(preflight.shutil, "which", return_value=None):
            result = preflight.scan(self.root)
        self.assertFalse(result["ok"])
        self.assertFalse(result["tools"]["node"])


if __name__ == "__main__":
    unittest.main()
