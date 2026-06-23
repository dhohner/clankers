from __future__ import annotations

import unittest

from support import SOURCE_ASSETS


class PrdBundleAssetsTests(unittest.TestCase):
    def test_review_assets_cover_responsive_navigation_anchor_and_print_behavior(self) -> None:
        script = (SOURCE_ASSETS / "app.js").read_text(encoding="utf-8")
        styles = (SOURCE_ASSETS / "styles.css").read_text(encoding="utf-8")

        self.assertIn('window.matchMedia("(max-width: 980px)")', script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn('event.key !== "Tab"', script)
        self.assertIn(
            "document.getElementById(decodeURIComponent(hash.slice(1)))",
            script,
        )
        self.assertIn("ResizeObserver", script)
        self.assertNotIn("setTimeout(stopAnchorStabilization", script)
        self.assertIn("focusAnchorTarget(hash)", script)
        self.assertIn('window.addEventListener("beforeprint"', script)
        self.assertIn("detail.open = true", script)
        self.assertIn("MERMAID_CDN", script)
        self.assertNotIn("prototype", script)
        self.assertIn("https://cdn.jsdelivr.net/npm/mermaid@11.15.0/", script)
        self.assertIn('securityLevel: "strict"', script)
        self.assertIn("Diagram rendering unavailable", script)
        self.assertIn("showMermaidFailure(canvas, error)", script)
        self.assertIn("initMermaidZoom(canvas)", script)
        self.assertIn('data-zoom="in"', script)
        self.assertIn('window.matchMedia("(prefers-reduced-motion: reduce)")', script)
        self.assertIn("@media (max-width: 980px)", styles)
        self.assertIn("position: fixed", styles)
        self.assertIn("height: 100dvh", styles)
        self.assertIn("grid-template-columns: 275px minmax(0, 1fr)", styles)
        self.assertIn("main {\n  grid-column: 2", styles)
        self.assertIn("width: 100%", styles)
        self.assertNotIn("width: min(1160px, 100%)", styles)
        self.assertIn("padding: 42px clamp(54px, 4vw, 88px) 70px", styles)
        self.assertNotIn(
            "main {\n  grid-column: 2;\n  width: 100%;\n"
            "  min-width: 0;\n"
            "  padding: 42px clamp(54px, 4vw, 88px) 70px;\n  background:",
            styles,
        )
        self.assertNotIn(
            ".hero {\n  position: relative;\n  padding: 42px 2px 38px;\n"
            "  border-bottom: 1px solid var(--line);\n  background:",
            styles,
        )
        self.assertIn(".requirement-list article", styles)
        self.assertIn(".metric-grid { grid-template-columns: repeat(3", styles)
        self.assertIn(
            ".timeline li { display: grid; grid-template-columns: 100px",
            styles,
        )
        self.assertIn("grid-template-columns: repeat(4, minmax(0, 1fr))", styles)
        self.assertIn("background: transparent", styles)
        self.assertIn("max-height: calc(100vh - 66px)", styles)
        self.assertIn("max-height: calc(100dvh - 66px)", styles)
        self.assertIn("overflow-x: hidden", styles)
        self.assertIn("overflow-wrap: anywhere", styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
        self.assertIn("@media print", styles)
        self.assertIn("details > *:not(summary)", styles)
        self.assertIn(".visual-surface", styles)
        self.assertIn(".diagram-canvas svg,\n.mermaid-canvas svg", styles)
        self.assertIn(".mermaid-toolbar", styles)
        self.assertIn("position: sticky", styles)
        self.assertIn("flex: 0 0 auto", styles)
        self.assertIn("max-width: none", styles)
        self.assertIn(".diagram-source code,", styles)
        self.assertIn("background: transparent", styles)
        self.assertIn(".native-diagram marker path", styles)
        self.assertNotIn("prototype", styles)
