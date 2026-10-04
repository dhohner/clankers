from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import support  # noqa: F401 - Establish the scripts package import path.

from scripts.styles import compile_stylesheet, minify_css


class StylesheetExportTests(unittest.TestCase):
    def test_minification_preserves_strings_selectors_and_calculations(self) -> None:
        styles = """
            .parent :is(.child, .other) {
                content: "two  spaces; { /* text */ }";
                width: calc(100% - 2 * var(--space-md));
                --gap: 1rem  2rem;
            }
            /* Keep comments and their token boundaries. */
            .escaped\\ name { content: "a\\\"b"; }
        """
        self.assertEqual(
            minify_css(styles),
            '.parent :is(.child,.other){content: "two  spaces; { /* text */ }";'
            "width: calc(100% - 2 * var(--space-md));--gap: 1rem 2rem;}"
            "/* Keep comments and their token boundaries. */ "
            '.escaped\\ name{content: "a\\"b";}',
        )

    def test_nested_imports_preserve_cascade_order_and_rebase_font_urls(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            assets = Path(scratch)
            (assets / "shared").mkdir()
            (assets / "styles.css").write_text(
                '@import url("./shared/base.css");\nbody { color: orange; }', encoding="utf-8"
            )
            (assets / "shared" / "base.css").write_text(
                '@import url("./type.css");\nbody { color: white; }', encoding="utf-8"
            )
            (assets / "shared" / "type.css").write_text(
                '@font-face { src: url("../fonts/manrope.woff2?v=1#font"); }\n'
                '.icon { background: url("data:image/svg+xml;base64,AA=="); }\n'
                ".text { content: 'url(\"do-not-rewrite\")'; }",
                encoding="utf-8",
            )
            compiled = compile_stylesheet(assets / "styles.css", assets)
            self.assertNotIn("@import", compiled)
            self.assertIn('url("./fonts/manrope.woff2?v=1#font")', compiled)
            self.assertIn('url("data:image/svg+xml;base64,AA==")', compiled)
            self.assertIn("content: 'url(\"do-not-rewrite\")'", compiled)
            self.assertLess(compiled.index("color: white"), compiled.index("color: orange"))

    def test_circular_imports_fail_with_a_clear_error(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            assets = Path(scratch)
            source = assets / "styles.css"
            source.write_text('@import url("./styles.css");', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Circular CSS import"):
                compile_stylesheet(source, assets)

    def test_imports_cannot_escape_the_asset_directory(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            assets = Path(scratch)
            source = assets / "styles.css"
            source.write_text('@import url("../outside.css");', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "outside the asset directory"):
                compile_stylesheet(source, assets)


if __name__ == "__main__":
    unittest.main()
