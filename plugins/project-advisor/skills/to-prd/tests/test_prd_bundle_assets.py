from __future__ import annotations

import unittest

from support import SOURCE_ASSETS


class PrdBundleAssetsTests(unittest.TestCase):
    """Guard the durable asset contract, not the byte-level styling.

    These assertions cover what a generated bundle must keep doing: stay
    read-only, stay reachable by keyboard, render or gracefully degrade its
    diagrams, ship its own fonts, and respect motion and contrast preferences.
    Visual decisions belong to the design system and are free to change.
    """

    def setUp(self) -> None:
        self.script = (SOURCE_ASSETS / "app.js").read_text(encoding="utf-8")
        self.styles = (SOURCE_ASSETS / "styles.css").read_text(encoding="utf-8")
        self.favicon = (SOURCE_ASSETS / "favicon.svg").read_text(encoding="utf-8")

    def test_review_interaction_stays_local_and_read_only(self) -> None:
        script = self.script

        self.assertNotIn("localStorage", script)
        self.assertNotIn("sessionStorage", script)
        self.assertNotIn("fetch(", script)
        self.assertNotIn("XMLHttpRequest", script)
        self.assertNotIn("prototype", script)
        self.assertNotIn("window.print", script)
        self.assertNotIn("beforeprint", script)

    def test_navigation_is_keyboard_reachable_and_collapses_on_mobile(self) -> None:
        script = self.script

        self.assertIn('return navToggle?.getAttribute("aria-expanded") === "true"', script)
        self.assertIn('navToggle.setAttribute("aria-expanded", String(open))', script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn("setNavigationOpen(false, true)", script)
        self.assertIn('mobileQuery.addEventListener("change"', script)
        self.assertIn('link.setAttribute("aria-current", "true")', script)

    def test_anchors_clear_the_sticky_chrome_and_move_focus(self) -> None:
        script = self.script

        self.assertIn("headerOffset()", script)
        self.assertIn("focusAnchorTarget(target)", script)
        self.assertIn("target.focus({ preventScroll: true })", script)
        self.assertIn("top: Math.max(0, top)", script)
        self.assertIn('window.addEventListener("hashchange"', script)

    def test_tables_carry_their_own_labels_for_narrow_screens(self) -> None:
        self.assertIn("labelTableCells()", self.script)
        self.assertIn('cell.setAttribute("data-label", headings[index])', self.script)
        self.assertIn("content: attr(data-label)", self.styles)

    def test_diagrams_render_from_a_pinned_source_and_degrade_safely(self) -> None:
        script = self.script

        self.assertIn("MERMAID_CDN", script)
        self.assertIn("https://cdn.jsdelivr.net/npm/mermaid@11.15.0/", script)
        self.assertIn('securityLevel: "strict"', script)
        self.assertIn("nodeSpacing: 46", script)
        self.assertIn("rankSpacing: 48", script)
        self.assertIn("useMaxWidth: false", script)
        self.assertIn("subGraphTitleMargin: { top: 6, bottom: 14 }", script)
        self.assertIn("clipEdgesAtClusterBoundaries(svg)", script)
        self.assertIn("showMermaidFailure(canvas, error)", script)
        self.assertIn("Diagram rendering unavailable", script)
        self.assertIn("if (details) details.open = true", script)

    def test_diagram_fit_bounds_come_only_from_the_stylesheet(self) -> None:
        script = self.script

        self.assertIn("diagramFitScale(canvas, naturalWidth, naturalHeight)", script)
        self.assertIn("parseFloat(styles.maxHeight)", script)
        self.assertNotIn("DIAGRAM_HEIGHT_RATIO", script)
        self.assertNotIn("DIAGRAM_MIN_HEIGHT", script)
        self.assertIn("initMermaidZoom(canvas)", script)
        self.assertIn('data-zoom="in"', script)
        self.assertIn('toolbar.setAttribute("aria-label", "Diagram zoom")', script)
        self.assertIn('aria-label="Reset diagram zoom to fit"', script)
        self.assertIn('class="mermaid-zoom-level" role="status" aria-live="polite"', script)
        self.assertIn(".mermaid-canvas svg", self.styles)
        self.assertIn(".mermaid-toolbar", self.styles)

    def test_a_zoomed_diagram_can_be_scrolled_and_keeps_its_controls(self) -> None:
        """Zoom is useless if the enlarged diagram cannot be reached.

        The canvas scrolls instead of clipping, centres safely so nothing lands
        past the scroll origin, and hands its controls to a frame outside the
        scrolling, hidden subtree.
        """
        script = self.script
        styles = self.styles

        canvas_rules = styles.split(".mermaid-canvas {")[1].split("}")[0]
        self.assertIn("overflow: auto;", canvas_rules)
        self.assertIn("place-content: safe center;", canvas_rules)
        self.assertNotIn("overflow: hidden;", canvas_rules)
        self.assertIn(".mermaid-frame { position: relative; }", styles)
        self.assertIn(".mermaid-canvas.is-panning", styles)

        self.assertIn('(canvas.closest(".mermaid-frame") ?? canvas).append(toolbar)', script)
        self.assertIn('canvas.removeAttribute("aria-hidden")', script)
        self.assertIn('canvas.setAttribute("tabindex", "0")', script)
        self.assertIn('svg.setAttribute("aria-hidden", "true")', script)
        self.assertIn("enableDragPanning(canvas)", script)
        self.assertIn('canvas.classList.toggle("is-pannable", canvasOverflows())', script)
        # Stepping the zoom keeps the reader where they were looking.
        self.assertIn("canvas.scrollLeft = focus.x * canvas.scrollWidth", script)

    def test_the_sheet_stops_widening_on_large_displays(self) -> None:
        styles = self.styles

        self.assertIn("--shell: 88rem;", styles)
        stage_rules = styles.split(".stage {")[1].split("}")[0]
        self.assertIn("max-width: var(--shell);", stage_rules)
        self.assertIn("margin-inline: auto;", stage_rules)

    def test_typography_ships_with_the_bundle(self) -> None:
        styles = self.styles

        self.assertIn("@font-face", styles)
        self.assertIn('src: url("./fonts/archivo-latin.woff2") format("woff2")', styles)
        self.assertIn('src: url("./fonts/martian-mono-latin.woff2") format("woff2")', styles)
        self.assertIn('src: url("./fonts/saira-stencil-one-latin.woff2") format("woff2")', styles)
        self.assertIn("font-display: swap", styles)
        # The display register is the world's stencil, not a heavier mono.
        self.assertIn('--font-display: "Saira Stencil One"', styles)
        self.assertIn("font-family: var(--font-display)", styles)
        for asset in (
            "archivo-latin.woff2",
            "martian-mono-latin.woff2",
            "saira-stencil-one-latin.woff2",
        ):
            self.assertTrue(
                (SOURCE_ASSETS / "fonts" / asset).is_file(),
                f"{asset} must ship inside the bundle so type is identical everywhere",
            )
        for licence in ("OFL-Archivo.txt", "OFL-MartianMono.txt", "OFL-SairaStencilOne.txt"):
            self.assertIn(
                "SIL Open Font License",
                (SOURCE_ASSETS / "fonts" / licence).read_text(encoding="utf-8"),
            )

    def test_the_cue_ladder_is_declared_once_and_covers_every_category(self) -> None:
        styles = self.styles

        self.assertIn("color-scheme: dark", styles)
        for level in (0, 10, 20, 30, 40, 50):
            self.assertIn(f'.cue[data-level="{level}"]', styles)
            self.assertIn(f'.cue-group[data-level="{level}"]', styles)
        self.assertIn("--night: #050506", styles)
        self.assertIn("--rose-gather: #d24bff", styles)
        self.assertIn("--rose-light: #ff7bae", styles)
        self.assertIn("--dawn: #ffd7e6", styles)
        self.assertIn("--day: #ffffff", styles)
        # COBALT HORIZON is the one step that had to move off the specified hex,
        # and the stylesheet must keep saying why.
        self.assertIn("--cobalt: #2f4bff", styles)
        self.assertIn("2.70:1", styles)
        self.assertIn(".cue--close", styles)
        self.assertIn(".houselights", styles)
        self.assertIn('--font-mono: "Martian Mono"', styles)

    def test_coverage_state_is_never_carried_by_colour_alone(self) -> None:
        styles = self.styles

        self.assertIn('[data-aspect="up"] .lamp', styles)
        self.assertIn('[data-aspect="held"] .lamp', styles)
        self.assertIn('.plate[data-aspect="held"] .aspect-reason', styles)
        self.assertIn(".coverage-gap", styles)
        self.assertIn(".coverage-detail", styles)

    def test_rollout_steps_hang_off_a_continuous_rail(self) -> None:
        """The rollout block is ordered, and the rail is what says so.

        The rail is drawn per step as the connector down to the next marker, so
        the last step carries none. Ruled rows are deliberately absent: they made
        four ordered phases read as an unordered table.
        """
        styles = self.styles

        self.assertIn(".sequence li::before", styles)
        self.assertIn(".sequence li:last-child::before { content: none; }", styles)
        self.assertIn("border-radius: 50%;", styles.split(".sequence-index")[1])
        self.assertNotIn("border-top: 1px solid var(--edge-soft);\n}\n\n.sequence", styles)

        narrow = styles.split("@media (max-width: 44rem)")[1]
        # Tightened, never collapsed: stacking the index above its phase would
        # drop the one line that carries the order.
        self.assertIn(".sequence { --step-marker: 1.75rem;", narrow)
        self.assertNotIn(".sequence li { grid-template-columns: minmax(0, 1fr)", narrow)

    def test_atmosphere_is_drawn_in_css_with_no_raster_overlay(self) -> None:
        """The cyclorama is gradients, by explicit product decision.

        A rendered raster version of the wall, the closing wash, and a film-grain
        tile was built and rejected in favour of the clean gradient, so none of
        those files may creep back into the shipped bundle.
        """
        styles = self.styles

        for asset in ("cyclorama.png", "dayrise.png", "grain.png", "grain.svg"):
            self.assertFalse(
                (SOURCE_ASSETS / asset).exists(),
                f"{asset} was rejected; the atmosphere is drawn in CSS",
            )
            self.assertNotIn(asset, styles)
        self.assertIn("radial-gradient(124% 56% at 56% 79%, var(--cobalt)", styles)
        # The closing cue carries the brightest band, and the page still ends on
        # night rather than resolving to a field of light.
        self.assertIn(".cue--close.is-lit .cue-band", styles)
        self.assertIn("background: var(--night-deep);", styles)

    def test_preferences_are_respected(self) -> None:
        styles = self.styles

        self.assertIn(":focus-visible", styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
        self.assertIn("animation-duration: .01ms !important", styles)
        # Reduced motion still ends fully lit rather than dark.
        self.assertIn(".cue-band { opacity: var(--band, .2); }", styles)
        self.assertNotIn("@media print", styles)

    def test_the_shell_is_responsive_without_horizontal_overflow(self) -> None:
        styles = self.styles

        self.assertIn("overflow-x: hidden", styles)
        self.assertIn("overflow-wrap: anywhere", styles)
        self.assertIn("@media (min-width: 48rem)", styles)
        self.assertIn("@media (min-width: 64rem)", styles)
        self.assertIn("@media (min-width: 68rem)", styles)
        self.assertIn("@media (max-width: 67.99rem)", styles)
        self.assertIn("@media (max-width: 44rem)", styles)
        self.assertIn("overflow-x: auto", styles)

    def test_the_plot_bar_keeps_the_page_gutter_on_both_sides(self) -> None:
        """The bar signs the document in type, inset like the page beneath it.

        The brand disc was removed, so nothing sits between the bar's left edge
        and the product name. The bar never insets by less than `--page-pad`, and
        past the shell width it grows the inset so its content stays aligned with
        the sheet instead of drifting to the edges of a wide display.
        """
        styles = self.styles

        self.assertNotIn(".brand-mark", styles)
        self.assertIn(
            "padding: 0 max(var(--page-pad), calc((100% - var(--shell)) / 2 + var(--page-pad)));",
            styles.split(".plot-bar {")[1],
        )
        narrow = styles.split("@media (max-width: 34rem)")[1]
        self.assertNotIn(".plot-bar { padding:", narrow)
        self.assertIn(".brand-role { display: none; }", narrow)

    def test_favicon_is_a_scalable_mark(self) -> None:
        self.assertIn("<svg", self.favicon)
        self.assertIn('viewBox="0 0 32 32"', self.favicon)
