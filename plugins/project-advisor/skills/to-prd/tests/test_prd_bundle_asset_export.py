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
                "app.js",
                "favicon.svg",
                "fonts/OFL-Manrope.txt",
                "fonts/manrope.woff2",
            ):
                with self.subTest(name):
                    self.assertEqual(
                        (assets / name).read_bytes(), (SOURCE_ASSETS / name).read_bytes()
                    )
            self.assertEqual(
                [path.relative_to(assets).as_posix() for path in assets.rglob("*.css")],
                ["styles.css"],
            )
            self.assertFalse((assets / "shared").exists())
            compiled = (assets / "styles.css").read_text(encoding="utf-8")
            self.assertNotIn("@import", compiled)
            self.assertIn("@font-face", compiled)
            self.assertIn('url("./fonts/manrope.woff2")', compiled)
            source_size = sum(
                path.stat().st_size
                for path in (
                    SOURCE_ASSETS / "styles.css",
                    *(SOURCE_ASSETS / "shared").glob("*.css"),
                )
            )
            self.assertLess(len(compiled.encode()), source_size)
            for stylesheet in assets.rglob("*.css"):
                styles = stylesheet.read_text(encoding="utf-8")
                for reference in re.findall(r'url\("([^"]+)"\)', styles):
                    with self.subTest(stylesheet=stylesheet, reference=reference):
                        self.assertTrue((stylesheet.parent / reference).is_file())


if __name__ == "__main__":
    unittest.main()
