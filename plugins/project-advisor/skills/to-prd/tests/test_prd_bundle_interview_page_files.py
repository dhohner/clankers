"""Static checks on the interview page files: their location, policy, and DOM writes."""

from __future__ import annotations

import re
import unittest

from support import SOURCE_ASSETS

from scripts.interview.server import PAGE_DIR, PAGE_POLICY

PAGE_FILES = ("index.html", "page.js", "page.css")
HTML_SINKS = ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write")


class InterviewPageFileTests(unittest.TestCase):
    def read(self, name: str) -> str:
        return (PAGE_DIR / name).read_text(encoding="utf-8")

    def test_page_policy_allows_connections_only_to_the_page_origin(self) -> None:
        directives = dict(directive.strip().split(" ", 1) for directive in PAGE_POLICY.split(";"))

        self.assertEqual(directives["connect-src"], "'self'")

    def test_page_policy_allows_no_inline_script_and_no_other_origin(self) -> None:
        for source in ("'unsafe-inline'", "'unsafe-eval'", "http:", "https:", "*", "data:"):
            with self.subTest(source):
                self.assertNotIn(source, PAGE_POLICY)

    def test_page_files_name_no_http_origin(self) -> None:
        for name in PAGE_FILES:
            with self.subTest(name):
                self.assertIsNone(re.search(r"https?:", self.read(name)))

    def test_page_shell_holds_no_inline_script_or_handler(self) -> None:
        shell = self.read("index.html")

        self.assertEqual(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>", shell), [])
        self.assertIsNone(re.search(r"\son[a-z]+\s*=", shell))

    def test_page_script_writes_no_markup(self) -> None:
        script = self.read("page.js")
        for sink in HTML_SINKS:
            with self.subTest(sink):
                self.assertNotIn(sink, script)

    def test_page_files_live_apart_from_bundle_assets(self) -> None:
        self.assertNotEqual(PAGE_DIR.resolve(), SOURCE_ASSETS.resolve())
        self.assertNotIn(SOURCE_ASSETS.resolve(), PAGE_DIR.resolve().parents)
        for name in PAGE_FILES:
            with self.subTest(name):
                self.assertTrue((PAGE_DIR / name).is_file())
                self.assertFalse((SOURCE_ASSETS / name).exists())


if __name__ == "__main__":
    unittest.main()
