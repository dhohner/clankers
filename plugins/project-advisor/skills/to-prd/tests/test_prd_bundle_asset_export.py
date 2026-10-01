from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

from support import EXAMPLE, SOURCE_ASSETS, run_cli


class BundleAssetExportTests(unittest.TestCase):
    def test_review_exports_only_required_assets_and_licenses(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            result = run_cli("generate", str(EXAMPLE), "--output", scratch)
            self.assertEqual(result.returncode, 0, result.stderr)
            bundles = list(Path(scratch).glob("PRD-*"))
            self.assertEqual(len(bundles), 1)
            bundle = bundles[0]
            assets = bundle / "assets"
            self.assertFalse((bundle / "interview.html").exists())
            self.assertFalse((assets / "interview").exists())
            for name in (
                "styles.css",
                "app.js",
                "favicon.svg",
                "shared/base.css",
                "fonts/OFL-Archivo.txt",
                "fonts/OFL-MartianMono.txt",
            ):
                with self.subTest(name):
                    self.assertEqual(
                        (assets / name).read_bytes(), (SOURCE_ASSETS / name).read_bytes()
                    )
            styles = (assets / "styles.css").read_text(encoding="utf-8")
            for reference in re.findall(r'url\("([^"]+)"\)', styles):
                with self.subTest(reference):
                    self.assertTrue((assets / reference).is_file())


if __name__ == "__main__":
    unittest.main()
