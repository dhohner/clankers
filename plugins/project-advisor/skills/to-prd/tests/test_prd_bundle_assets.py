from __future__ import annotations

import unittest

from support import SOURCE_ASSETS


class PrdBundleAssetsTests(unittest.TestCase):
    def test_review_assets_cover_responsive_navigation_anchor_and_print_behavior(self) -> None:
        script = (SOURCE_ASSETS / "app.js").read_text(encoding="utf-8")
        styles = (SOURCE_ASSETS / "styles.css").read_text(encoding="utf-8")
        favicon = (SOURCE_ASSETS / "favicon.svg").read_text(encoding="utf-8")
        grain = (SOURCE_ASSETS / "grain.svg").read_text(encoding="utf-8")

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
        self.assertIn("nodeSpacing: 46", script)
        self.assertIn("rankSpacing: 48", script)
        self.assertIn("useMaxWidth: false", script)
        self.assertIn("subGraphTitleMargin: { top: 6, bottom: 14 }", script)
        self.assertIn("clipEdgesAtClusterBoundaries(svg)", script)
        self.assertNotIn('clusterBkg: "transparent"', script)
        self.assertNotIn('clusterBorder: "transparent"', script)
        self.assertIn('clusterBkg: "#e6edf4"', script)
        self.assertIn('clusterBkg: "#141f2c"', script)
        self.assertIn("Diagram rendering unavailable", script)
        self.assertIn("showMermaidFailure(canvas, error)", script)
        self.assertIn("initMermaidZoom(canvas)", script)
        self.assertIn("diagramFitScale(canvas, naturalWidth, naturalHeight)", script)
        self.assertIn("DIAGRAM_HEIGHT_RATIO", script)
        self.assertIn('data-zoom="in"', script)
        self.assertIn('window.matchMedia("(prefers-reduced-motion: reduce)")', script)
        self.assertIn(
            "sidebar ? sidebar.getBoundingClientRect().height : 0",
            script,
        )
        self.assertIn('if (target.id === "summary") return 0', script)
        self.assertIn("top: Math.max(0, anchorScrollTop(target))", script)
        self.assertIn(
            'return navToggle?.getAttribute("aria-expanded") === "true"',
            script,
        )
        self.assertIn('document.body.classList.toggle("navigation-open", open)', script)
        self.assertIn('window.matchMedia("(prefers-color-scheme: dark)")', script)
        self.assertIn('primaryColor: "#f8fafc"', script)
        self.assertIn('primaryBorderColor: "#175986"', script)
        self.assertIn('primaryColor: "#182331"', script)
        self.assertIn('primaryBorderColor: "#6da9cf"', script)
        self.assertIn("...diagramPalette", script)
        self.assertIn("buildReviewOverview()", script)
        self.assertIn("groupNavigation()", script)
        self.assertIn('link === summaryLink\n      ? "framing"', script)
        self.assertNotIn('summaryLink.classList.add("nav-summary-link")', script)
        self.assertIn('data-review-lens="decisions"', script)
        self.assertIn('data-review-lens="validation"', script)
        self.assertIn("makeTablesResponsive()", script)
        self.assertIn('cell.dataset.label = labels[index] || ""', script)
        self.assertIn('content.className = "responsive-cell-content"', script)
        self.assertNotIn("addSectionCategoryLabels", script)

        self.assertIn("color-scheme: light dark", styles)
        self.assertIn("--canvas: #e8edf4", styles)
        self.assertIn("--ink: #121827", styles)
        self.assertIn("--muted: #4c566a", styles)
        self.assertNotIn("--grid-line", styles)
        self.assertIn("--line: #d1d8e3", styles)
        self.assertIn("--line-strong: #929daf", styles)
        self.assertIn("--accent: #175986", styles)
        self.assertNotIn("--coral:", styles)
        self.assertNotIn("--gold:", styles)
        self.assertIn("--radius-control: 8px", styles)
        self.assertIn("--radius-surface: 16px", styles)
        self.assertIn(
            '--font-mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
            styles,
        )
        self.assertIn("code {\n  padding: .12rem .38rem;", styles)
        self.assertIn("font-family: var(--font-mono)", styles)
        self.assertIn("--section-space: clamp(72px, 7vw, 104px)", styles)
        self.assertIn("--cluster-space: clamp(28px, 3vw, 44px)", styles)
        self.assertIn("--panel-space: clamp(28px, 3vw, 42px)", styles)
        self.assertNotIn("gradient(", styles)
        self.assertNotIn("--grid-size", styles)
        self.assertIn('background: url("./grain.svg") repeat', styles)
        self.assertIn("--grain-opacity: .035", styles)
        self.assertIn("mix-blend-mode: var(--grain-blend)", styles)
        self.assertIn("feTurbulence", grain)
        self.assertIn(".sidebar {\n  position: sticky;", styles)
        self.assertIn("backdrop-filter: blur(18px)", styles)
        self.assertIn(".nav-toggle {\n  display: inline-flex;", styles)
        self.assertIn(".sidebar-panel {\n  position: absolute;", styles)
        self.assertIn("max-height: calc(100dvh - 78px)", styles)
        self.assertIn(".sidebar nav {\n  display: grid;", styles)
        self.assertIn("grid-template-columns: repeat(4, minmax(0, 1fr))", styles)
        self.assertIn(".sidebar nav a.active", styles)
        self.assertIn(".sidebar nav.is-grouped", styles)
        self.assertNotIn(".nav-summary-link", styles)
        self.assertIn(".review-lenses button[aria-pressed=\"true\"]", styles)
        self.assertIn(".review-overview {", styles)
        self.assertNotIn(".section-category", styles)
        self.assertNotIn("scrollbar-width: thin", styles)
        self.assertNotIn("white-space: nowrap;\n}", styles)

        self.assertIn(".hero {\n  width: min(100%, 1320px);", styles)
        self.assertIn("width: min(100%, 1320px)", styles)
        self.assertNotIn("min-height: min(780px", styles)
        self.assertIn("font-size: clamp(3.25rem, 5.4vw, 4.9rem)", styles)
        self.assertNotIn(".hero-map", styles)
        self.assertNotIn(".map-core", styles)
        self.assertIn(".metadata {\n  display: grid;", styles)
        self.assertIn("grid-template-columns: repeat(3, minmax(0, 1fr))", styles)
        self.assertIn(".metadata div:nth-child(3n + 1)", styles)
        self.assertIn(
            ".metadata div:nth-child(3n + 1):not(:first-child)::before {\n"
            "  position: absolute;\n"
            "  top: 0;\n"
            "  left: 0;\n"
            "  width: 300%;",
            styles,
        )
        self.assertNotIn(".metadata div:nth-child(n + 4)", styles)
        self.assertIn("pointer-events: none", styles)

        self.assertIn(".section-heading {\n  margin-bottom: var(--cluster-space)", styles)
        self.assertIn("margin: var(--section-space) auto 0", styles)
        self.assertIn("padding: 0", styles)
        self.assertIn("max-width: min(24ch, 100%)", styles)
        self.assertIn("overflow-wrap: break-word", styles)
        self.assertNotIn(".section-heading > span", styles)
        self.assertIn(
            ".section-heading {\n  margin-bottom: var(--cluster-space);\n  padding-top: 22px;\n  border-top: 1px solid var(--line-strong);",
            styles,
        )
        self.assertIn(".divider-grid {", styles)
        self.assertIn("grid-template-columns: repeat(4", styles)
        self.assertIn(".divider-grid--3 { grid-template-columns: repeat(6", styles)
        self.assertIn(".divider-grid--2 > :last-child:nth-child(odd)", styles)
        self.assertIn(
            ".divider-grid--2 > :last-child:nth-child(odd) { grid-column: 1 / span 2; }",
            styles,
        )
        self.assertIn(
            ".divider-grid--2 > :last-child:nth-child(odd):not(:first-child)::before",
            styles,
        )
        self.assertIn(".divider-grid--3 > :last-child:nth-child(3n + 1)", styles)
        self.assertIn(".divider-grid--3 > :nth-last-child(2):nth-child(3n + 1)", styles)
        self.assertIn(
            ".divider-grid--3 > :last-child:nth-child(3n + 1) {\n"
            "  grid-column: 1 / span 2;",
            styles,
        )
        self.assertIn(
            ".divider-grid--3 > :nth-last-child(2):nth-child(3n + 1) {\n"
            "  grid-column: 1 / span 2;",
            styles,
        )
        self.assertIn(
            ".divider-grid--3 > :last-child:nth-child(3n + 2) {\n"
            "  grid-column: 3 / span 2;",
            styles,
        )
        self.assertIn("width: 300%", styles)
        self.assertIn("border-block: 1px solid var(--line-strong)", styles)
        self.assertIn("border-left: 1px solid var(--line-strong)", styles)
        self.assertIn(".divider-grid--3 > :nth-child(n + 4)", styles)
        self.assertIn(".divider-grid > :last-child:nth-child(odd)", styles)
        self.assertIn("background: var(--surface)", styles)
        self.assertIn("main {\n  width: 100%;", styles)
        self.assertIn("main {\n  width: 100%;\n  min-width: 0;\n  margin: 0;", styles)
        self.assertNotIn("--sheet-shadow", styles)
        self.assertNotIn("border-radius: 48px 48px 0 0", styles)
        self.assertIn(".section > .callout {\n  width: 100%;\n  max-width: none;", styles)
        self.assertIn(
            "grid-template-columns: minmax(150px, 190px) minmax(0, 1fr)",
            styles,
        )
        self.assertIn(".requirement-list article", styles)
        self.assertIn("grid-template-columns: 106px minmax(0, 1fr)", styles)
        self.assertIn(
            ".status {\n  display: inline-flex;\n  align-items: center;\n  padding: 6px 10px 5px;\n  border: 1.5px solid var(--accent);",
            styles,
        )
        self.assertIn(
            ".entity-id {\n  display: inline-block;\n  margin-bottom: 9px;\n  padding: 4px 7px 3px;\n  border: 1px solid var(--line-strong);",
            styles,
        )
        self.assertIn(".entity-id:hover,\n.entity-id:focus-visible {", styles)
        self.assertIn(".entity-links a {\n  font-family: var(--font-mono);", styles)
        self.assertIn(".timeline li {", styles)
        self.assertIn("grid-template-columns: 90px minmax(0, 1fr)", styles)
        self.assertIn(".timeline::before {", styles)
        self.assertIn(".timeline-marker {", styles)
        self.assertIn("background: var(--canvas);\n  color: var(--accent-dark);", styles)
        self.assertIn("border-radius: 999px", styles)
        self.assertIn("border-block: 1px solid var(--line-strong)", styles)
        self.assertIn("background: transparent", styles)
        self.assertIn(".id-table th { white-space: nowrap; overflow-wrap: normal; }", styles)

        self.assertIn("@media (max-width: 980px)", styles)
        self.assertIn(
            ".divider-grid,\n  .divider-grid--3 { grid-template-columns: repeat(4",
            styles,
        )
        self.assertNotIn("grid-column: 1 / -1", styles)
        self.assertIn("position: fixed", styles)
        self.assertIn("max-height: calc(100vh - 72px)", styles)
        self.assertIn("max-height: calc(100dvh - 72px)", styles)
        self.assertIn("@media (max-width: 700px)", styles)
        self.assertIn("--panel-space: 22px 20px", styles)
        self.assertIn(".divider-grid > :nth-child(n) {", styles)
        self.assertIn(".divider-grid > :nth-child(n + 2)", styles)
        self.assertIn(
            ".supporting-detail .split {\n  margin: 0;\n  border-block: 0;",
            styles,
        )
        self.assertIn("@media (max-width: 460px)", styles)
        self.assertIn(".metadata { grid-template-columns: repeat(2", styles)
        self.assertIn(
            "  .metadata div:nth-child(3n + 1):not(:first-child)::before { content: none; }\n"
            "  .metadata div:nth-child(odd):not(:first-child)::before {\n"
            "    position: absolute;\n"
            "    top: 0;\n"
            "    left: 0;\n"
            "    width: 200%;",
            styles,
        )
        self.assertNotIn(".metadata div:nth-child(n + 3)", styles)
        self.assertIn("overflow-x: hidden", styles)
        self.assertIn("overflow-wrap: anywhere", styles)
        self.assertIn("@media (prefers-color-scheme: dark)", styles)
        self.assertIn("--canvas: #101722", styles)
        self.assertIn("--on-accent: #0e1b25", styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
        self.assertIn("@media print", styles)
        self.assertIn("details > *:not(summary)", styles)
        self.assertIn(".visual-surface", styles)
        self.assertIn(".review-frame", styles)
        self.assertIn(".review-regions", styles)
        self.assertNotIn(".screen-chrome", styles)
        self.assertIn("button:active", styles)
        self.assertIn("transform: scale(.98)", styles)
        self.assertIn("--motion-duration: 220ms", styles)
        self.assertIn(".nav-toggle:hover", styles)
        self.assertIn("transition:", styles)
        self.assertIn("<svg", favicon)
        self.assertIn('viewBox="0 0 32 32"', favicon)
        self.assertIn("table.responsive-table", styles)
        self.assertIn(".responsive-table td::before", styles)
        self.assertIn("@media (prefers-contrast: more)", styles)
        self.assertIn("@media (forced-colors: active)", styles)
        self.assertIn(".mermaid-canvas svg", styles)
        self.assertIn(".mermaid-toolbar", styles)
        self.assertIn(".mermaid-canvas .cluster rect", styles)
        self.assertNotIn("stroke: transparent !important", styles)
        self.assertIn(".mermaid-canvas .cluster-label", styles)
        self.assertNotIn(".mermaid-canvas .cluster-label { display: none; }", styles)
        self.assertIn("--diagram-cluster:", styles)
        self.assertIn(".coverage-gap", styles)
        self.assertIn(".coverage-detail", styles)
        self.assertIn("position: sticky", styles)
        self.assertIn("flex: 0 0 auto", styles)
        self.assertIn("max-width: none", styles)
        self.assertIn(".diagram-source code,", styles)
        self.assertIn("background: transparent", styles)
        self.assertNotIn(".native-diagram", styles)
        self.assertNotIn("prototype", styles)
