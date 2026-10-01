"""Static checks on the interview page files: their location, policy, and DOM writes."""

from __future__ import annotations

import re
import unittest

from support import SOURCE_ASSETS

from scripts.interview.server import PAGE_DIR, PAGE_POLICY, STATIC_FILES
from scripts.paths import SOURCE_DIR

PAGE_FILES = ("app.js", "styles.css", "tokens.css")
HTML_SINKS = ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write")


class InterviewPageFileTests(unittest.TestCase):
    def read(self, name: str) -> str:
        path = SOURCE_DIR / "interview.html" if name == "index.html" else PAGE_DIR / name
        return path.read_text(encoding="utf-8")

    def test_page_policy_allows_connections_only_to_the_page_origin(self) -> None:
        directives = dict(directive.strip().split(" ", 1) for directive in PAGE_POLICY.split(";"))

        self.assertEqual(directives["connect-src"], "'self'")

    def test_page_policy_allows_no_inline_script_and_no_other_origin(self) -> None:
        for source in ("'unsafe-inline'", "'unsafe-eval'", "http:", "https:", "*", "data:"):
            with self.subTest(source):
                self.assertNotIn(source, PAGE_POLICY)

    def test_page_files_name_no_http_origin(self) -> None:
        for name in ("index.html", *PAGE_FILES):
            with self.subTest(name):
                self.assertIsNone(re.search(r"https?:", self.read(name)))

    def test_page_shell_holds_no_inline_script_or_handler(self) -> None:
        shell = self.read("index.html")

        self.assertEqual(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>", shell), [])
        self.assertIsNone(re.search(r"\son[a-z]+\s*=", shell))

    def test_page_script_writes_no_markup(self) -> None:
        script = self.read("app.js")
        for sink in HTML_SINKS:
            with self.subTest(sink):
                self.assertNotIn(sink, script)

    def test_page_assets_live_in_the_interview_directory(self) -> None:
        self.assertEqual(PAGE_DIR, SOURCE_ASSETS / "interview")
        for name in PAGE_FILES:
            with self.subTest(name):
                self.assertTrue((PAGE_DIR / name).is_file())

    def test_page_references_are_allowlisted(self) -> None:
        shell = self.read("index.html")
        for reference in re.findall(r'(?:href|src)="([^"]+)"', shell):
            with self.subTest(reference):
                self.assertIn(reference, STATIC_FILES)
                self.assertTrue(STATIC_FILES[reference][0].is_file())
        self.assertNotIn('href="/assets/styles.css"', shell)
        css = self.read("styles.css")
        for reference in re.findall(r'url\("([^"]+)"\)', css):
            self.assertTrue((PAGE_DIR / reference).is_file())


if __name__ == "__main__":
    unittest.main()
