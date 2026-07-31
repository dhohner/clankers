const mobileQuery = window.matchMedia("(max-width: 67.99rem)");
const cueSheet = document.querySelector(".cue-sheet");
const navToggle = document.querySelector("#nav-toggle");
const sidebarPanel = document.querySelector("#sidebar-panel");
const navLinks = [...document.querySelectorAll(".cue-group a")];
const cues = [...document.querySelectorAll("main > section.cue")];
const supportingDetails = [...document.querySelectorAll("details")];
const detailsToggle = document.querySelector("#collapse-all");

/* ---------- Cue sheet ---------- */

function navigationIsOpen() {
  return navToggle?.getAttribute("aria-expanded") === "true";
}

function setNavigationOpen(open, restoreFocus = false) {
  if (!navToggle || !sidebarPanel) return;
  navToggle.setAttribute("aria-expanded", String(open));
  sidebarPanel.classList.toggle("is-open", open);
  if (restoreFocus) navToggle.focus();
}

navToggle?.addEventListener("click", () => setNavigationOpen(!navigationIsOpen()));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigationIsOpen()) setNavigationOpen(false, true);
});

document.addEventListener("click", (event) => {
  if (!navigationIsOpen() || !mobileQuery.matches) return;
  if (!cueSheet?.contains(event.target)) setNavigationOpen(false);
});

mobileQuery.addEventListener("change", () => setNavigationOpen(false));

/* ---------- The light follows the reader ---------- */

// A cue raises its horizon band once it is genuinely in the frame, so the page
// lights up in reading order rather than all at once.
const lightObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-lit");
      lightObserver.unobserve(entry.target);
    });
  },
  { rootMargin: "-10% 0px -25% 0px" },
);
cues.forEach((cue) => lightObserver.observe(cue));

const linkById = new Map(
  navLinks.map((link) => [decodeURIComponent(link.hash.slice(1)), link]),
);
let currentCueId;

function markCurrent(id) {
  const link = linkById.get(id);
  if (id !== currentCueId) {
    currentCueId = id;
    navLinks.forEach((navLink) => navLink.removeAttribute("aria-current"));
    cues.forEach((cue) => cue.classList.toggle("is-current", cue.id === id));
    if (link) link.setAttribute("aria-current", "true");
  }
  if (!link || mobileQuery.matches || !cueSheet) return;
  const linkBox = link.getBoundingClientRect();
  const railBox = cueSheet.getBoundingClientRect();
  if (linkBox.top < railBox.top || linkBox.bottom > railBox.bottom) {
    link.scrollIntoView({ block: "nearest" });
  }
}

function headerOffset() {
  const bar = document.querySelector(".plot-bar");
  const barHeight = bar ? bar.getBoundingClientRect().height : 0;
  const railHeight = mobileQuery.matches && cueSheet
    ? cueSheet.getBoundingClientRect().height
    : 0;
  return barHeight + railHeight + 16;
}

function updateCurrentCue() {
  const line = headerOffset() + 24;
  let current = "";
  for (const cue of cues) {
    if (cue.getBoundingClientRect().top > line) break;
    current = cue.id;
  }
  markCurrent(current);
}

let spyFrame = 0;
window.addEventListener(
  "scroll",
  () => {
    if (spyFrame) return;
    spyFrame = window.requestAnimationFrame(() => {
      spyFrame = 0;
      updateCurrentCue();
    });
  },
  { passive: true },
);
window.addEventListener("resize", updateCurrentCue);
updateCurrentCue();

/* ---------- Anchors ---------- */

function positionAnchor(target, behavior = "smooth") {
  const top = window.scrollY + target.getBoundingClientRect().top - headerOffset();
  window.scrollTo({ top: Math.max(0, top), behavior });
}

function focusAnchorTarget(target) {
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.focus({ preventScroll: true });
}

function targetForHash(hash) {
  const id = decodeURIComponent(hash.slice(1));
  return id ? document.getElementById(id) : null;
}

document.addEventListener("click", (event) => {
  const link = event.target.closest?.('a[href^="#"]');
  if (!link || link.classList.contains("skip-link")) return;
  const target = targetForHash(link.hash);
  if (!target) return;
  event.preventDefault();
  if (mobileQuery.matches && navigationIsOpen()) setNavigationOpen(false);
  history.replaceState(null, "", link.hash);
  positionAnchor(target);
  focusAnchorTarget(target);
  updateCurrentCue();
});

window.addEventListener("hashchange", () => {
  const target = targetForHash(location.hash);
  if (target) positionAnchor(target, "auto");
});

window.addEventListener("load", () => {
  const target = targetForHash(location.hash);
  if (target) positionAnchor(target, "auto");
  updateCurrentCue();
});

/* ---------- Notes ---------- */

function syncDetailsToggle() {
  if (!detailsToggle) return;
  const anyOpen = supportingDetails.some((detail) => detail.open);
  detailsToggle.setAttribute("aria-pressed", String(!anyOpen));
  detailsToggle.textContent = anyOpen ? "Collapse notes" : "Expand notes";
}

detailsToggle?.addEventListener("click", () => {
  const anyOpen = supportingDetails.some((detail) => detail.open);
  supportingDetails.forEach((detail) => {
    detail.open = !anyOpen;
  });
  syncDetailsToggle();
});

supportingDetails.forEach((detail) => detail.addEventListener("toggle", syncDetailsToggle));
syncDetailsToggle();

/* ---------- Tables ---------- */

// Narrow screens drop the header row, so every cell carries its own label.
function labelTableCells() {
  document.querySelectorAll(".table-wrap table").forEach((table) => {
    const headings = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent.trim());
    if (!headings.length) return;
    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (headings[index]) cell.setAttribute("data-label", headings[index]);
      });
    });
  });
}

labelTableCells();

/* ---------- Diagrams ---------- */

const MERMAID_CDN =
  "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs";

function showMermaidFailure(canvas, error) {
  canvas.replaceChildren();
  const message = document.createElement("p");
  message.className = "visual-loading";
  message.textContent = "Diagram rendering unavailable. Review the source fallback below.";
  canvas.append(message);
  canvas.closest(".mermaid-diagram")?.classList.add("render-failed");
  const source = document.getElementById(canvas.dataset.mermaidSource);
  const details = source?.closest("details");
  if (details) details.open = true;
  console.warn("A Mermaid diagram could not be rendered.", error);
}

const EDGE_SAMPLE_STEP = 2;
const diagramRefits = [];

function clusterBoxes(svg) {
  return [...svg.querySelectorAll("g.cluster")]
    .map((cluster) => {
      const shape = cluster.querySelector("rect, polygon, path");
      if (!shape) return null;
      const box = shape.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      return { box, area: box.width * box.height };
    })
    .filter(Boolean);
}

function boxContains(box, point) {
  return point.x >= box.left
    && point.x <= box.right
    && point.y >= box.top
    && point.y <= box.bottom;
}

// An edge that ends on a node inside a subgraph would otherwise tunnel through
// the subgraph border and its title. Cut the drawn path at the boundary so the
// arrowhead lands on the enclosing box instead.
function clipEdgesAtClusterBoundaries(svg) {
  const clusters = clusterBoxes(svg);
  if (!clusters.length) return;
  svg.querySelectorAll("g.edgePaths path").forEach((path) => {
    const totalLength = path.getTotalLength();
    const matrix = path.getScreenCTM();
    if (!totalLength || !matrix) return;
    const samples = [];
    for (let length = 0; length < totalLength; length += EDGE_SAMPLE_STEP) {
      samples.push(path.getPointAtLength(length));
    }
    samples.push(path.getPointAtLength(totalLength));
    const toScreen = (point) => ({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    });
    const start = toScreen(samples[0]);
    const end = toScreen(samples.at(-1));
    const enclosing = clusters
      .filter((cluster) => boxContains(cluster.box, end) && !boxContains(cluster.box, start))
      .sort((left, right) => right.area - left.area)[0];
    if (!enclosing) return;
    const cutIndex = samples.findIndex((point) => boxContains(enclosing.box, toScreen(point)));
    if (cutIndex < 1) return;
    const kept = samples.slice(0, cutIndex + 1);
    path.setAttribute(
      "d",
      kept
        .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" "),
    );
  });
}

// The canvas stylesheet already declares how much room a diagram may occupy.
// Read that box back rather than keeping a second height budget here, so the
// fitted diagram fills the frame it is given instead of undershooting it.
function diagramFitScale(canvas, naturalWidth, naturalHeight) {
  if (!naturalWidth || !naturalHeight) return 1;
  const styles = window.getComputedStyle(canvas);
  const horizontalPadding = (parseFloat(styles.paddingLeft) || 0)
    + (parseFloat(styles.paddingRight) || 0);
  // min-height and max-height are border-box measurements here, so the frame
  // and the padding both come off the room a diagram actually gets.
  const verticalChrome = (parseFloat(styles.paddingTop) || 0)
    + (parseFloat(styles.paddingBottom) || 0)
    + (parseFloat(styles.borderTopWidth) || 0)
    + (parseFloat(styles.borderBottomWidth) || 0);
  const reservedHeight = [...canvas.children]
    .filter((child) => child.tagName.toLowerCase() !== "svg")
    .reduce((total, child) => total + child.getBoundingClientRect().height, 0);
  const availableWidth = canvas.clientWidth - horizontalPadding;
  const availableHeight = Math.max(
    (parseFloat(styles.minHeight) || 0) - verticalChrome,
    (parseFloat(styles.maxHeight) || 0) - verticalChrome - reservedHeight,
  );
  if (availableWidth <= 0 || availableHeight <= 0) return 1;
  return Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
}

function initMermaidZoom(canvas) {
  const svg = canvas.querySelector("svg");
  if (!svg) return;
  const viewBox = svg.viewBox.baseVal;
  const bounds = svg.getBoundingClientRect();
  const naturalWidth = viewBox?.width || bounds.width;
  const naturalHeight = viewBox?.height || bounds.height;
  svg.style.maxWidth = "none";
  svg.style.maxHeight = "none";
  let fitScale = 1;
  let zoom = 1;
  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-toolbar";
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "Diagram zoom");
  const minus = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg>';
  const plus = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9"/></svg>';
  const reset = '<svg viewBox="0 0 16 16" aria-hidden="true">'
    + '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5V5h-2.5"/></svg>';
  toolbar.innerHTML = `
    <button type="button" data-zoom="out" aria-label="Zoom diagram out">${minus}</button>
    <span class="mermaid-zoom-level" role="status" aria-live="polite">Fit</span>
    <button type="button" data-zoom="in" aria-label="Zoom diagram in">${plus}</button>
    <button type="button" data-zoom="reset" aria-label="Reset diagram zoom to fit">${reset}</button>
  `;
  const label = toolbar.querySelector(".mermaid-zoom-level");
  function applyScale() {
    const scale = fitScale * zoom;
    // Round down so a fitted diagram can never overflow the canvas by a
    // subpixel and introduce a scrollbar at rest.
    svg.style.width = `${Math.floor(naturalWidth * scale)}px`;
    svg.style.height = `${Math.floor(naturalHeight * scale)}px`;
    if (label) label.textContent = zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`;
  }
  function setZoom(nextZoom) {
    zoom = Math.min(4, Math.max(0.5, Math.round(nextZoom * 100) / 100));
    applyScale();
  }
  toolbar.addEventListener("click", (event) => {
    const action = event.target.closest?.("button")?.dataset?.zoom;
    if (action === "in") setZoom(zoom + 0.25);
    if (action === "out") setZoom(zoom - 0.25);
    if (action === "reset") setZoom(1);
  });
  canvas.prepend(toolbar);
  fitScale = diagramFitScale(canvas, naturalWidth, naturalHeight);
  applyScale();
  diagramRefits.push(() => {
    if (zoom !== 1) return;
    fitScale = diagramFitScale(canvas, naturalWidth, naturalHeight);
    applyScale();
  });
}

let refitTimer;
window.addEventListener("resize", () => {
  window.clearTimeout(refitTimer);
  refitTimer = window.setTimeout(() => diagramRefits.forEach((refit) => refit()), 150);
});

async function renderMermaidDiagrams() {
  const canvases = [...document.querySelectorAll(".mermaid-canvas")];
  if (!canvases.length) return;
  let mermaid;
  try {
    const module = await import(MERMAID_CDN);
    mermaid = module.default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      flowchart: {
        nodeSpacing: 46,
        rankSpacing: 48,
        padding: 12,
        curve: "basis",
        useMaxWidth: false,
        subGraphTitleMargin: { top: 6, bottom: 14 },
      },
      themeVariables: {
        fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif',
        fontSize: "14px",
        background: "#010207",
        primaryColor: "#0e1220",
        primaryBorderColor: "#6f86ff",
        primaryTextColor: "#e7e9f2",
        secondaryColor: "#141a2e",
        tertiaryColor: "#101828",
        lineColor: "#8497ff",
        textColor: "#e7e9f2",
        edgeLabelBackground: "#05060a",
        clusterBkg: "#0a0d18",
        clusterBorder: "#39406b",
        titleColor: "#ffb3cd",
        nodeTextColor: "#e7e9f2",
      },
    });
  } catch (error) {
    canvases.forEach((canvas) => showMermaidFailure(canvas, error));
    return;
  }

  await Promise.all(canvases.map(async (canvas, index) => {
    try {
      const source = document.getElementById(canvas.dataset.mermaidSource);
      if (!source) throw new Error("Mermaid source is missing");
      const result = await mermaid.render(`prd-mermaid-${index + 1}`, source.textContent);
      canvas.innerHTML = result.svg;
      const svg = canvas.querySelector("svg");
      if (svg) clipEdgesAtClusterBoundaries(svg);
      initMermaidZoom(canvas);
      canvas.closest(".mermaid-diagram")?.classList.add("rendered");
    } catch (error) {
      showMermaidFailure(canvas, error);
    }
  }));
  syncDetailsToggle();
}

renderMermaidDiagrams();
