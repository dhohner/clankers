document.documentElement.classList.add("js");

const mobileQuery = window.matchMedia("(max-width: 980px)");
const sidebar = document.querySelector(".sidebar");
const navToggle = document.querySelector("#nav-toggle");
const sidebarPanel = document.querySelector("#sidebar-panel");
const navLinks = [...document.querySelectorAll(".sidebar nav a")];
const internalLinks = [...document.querySelectorAll('a[href^="#"]')];
const sections = [...document.querySelectorAll("main > section[id]")];
const supportingDetails = [...document.querySelectorAll("details")];
const detailsToggle = document.querySelector("#collapse-all");
const printButton = document.querySelector("#print-document");
let anchorObserver;

function navigationIsOpen() {
  return (
    mobileQuery.matches
    && navToggle?.getAttribute("aria-expanded") === "true"
  );
}

function focusableNavigationItems() {
  if (!sidebar) return [];
  return [...sidebar.querySelectorAll("a[href], button:not([disabled])")]
    .filter((element) => element.getClientRects().length > 0);
}

function setNavigationOpen(open, restoreFocus = false) {
  if (!navToggle || !sidebarPanel) return;
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute(
    "aria-label",
    open ? "Close document navigation" : "Open document navigation",
  );
  sidebarPanel.classList.toggle("open", open);
  document.body.classList.toggle("navigation-open", open && mobileQuery.matches);
  if (open) navLinks[0]?.focus();
  if (!open && restoreFocus) navToggle.focus();
}

navToggle?.addEventListener("click", () => {
  const open = navToggle.getAttribute("aria-expanded") !== "true";
  setNavigationOpen(open, !open);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigationIsOpen()) {
    setNavigationOpen(false, true);
    return;
  }
  if (event.key !== "Tab" || !navigationIsOpen()) return;

  const focusableItems = focusableNavigationItems();
  const firstItem = focusableItems[0];
  const lastItem = focusableItems.at(-1);
  if (!firstItem || !lastItem) return;
  if (event.shiftKey && document.activeElement === firstItem) {
    event.preventDefault();
    lastItem.focus();
  } else if (!event.shiftKey && document.activeElement === lastItem) {
    event.preventDefault();
    firstItem.focus();
  }
});

document.addEventListener("click", (event) => {
  if (
    navigationIsOpen()
    && sidebar
    && !sidebar.contains(event.target)
  ) {
    setNavigationOpen(false);
  }
});

mobileQuery.addEventListener("change", () => setNavigationOpen(false));

function headerOffset() {
  return mobileQuery.matches && sidebar
    ? sidebar.getBoundingClientRect().height + 12
    : 12;
}

function positionAnchor(target, behavior = "auto") {
  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: reducedMotion ? "auto" : behavior,
  });
}

function stopAnchorStabilization() {
  anchorObserver?.disconnect();
  anchorObserver = undefined;
}

function stabilizeAnchor(target) {
  stopAnchorStabilization();
  if (!("ResizeObserver" in window)) return;
  anchorObserver = new ResizeObserver(() => positionAnchor(target));
  anchorObserver.observe(document.body);
}

function targetForHash(hash) {
  if (!hash || hash === "#" || !hash.startsWith("#")) return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

function navigateToHash(hash, behavior = "smooth") {
  const target = targetForHash(hash);
  if (!target) return false;
  positionAnchor(target, behavior);
  stabilizeAnchor(target);
  return true;
}

function focusAnchorTarget(hash) {
  const target = targetForHash(hash);
  if (!target) return;
  const hadTabIndex = target.hasAttribute("tabindex");
  if (!hadTabIndex) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  if (!hadTabIndex) {
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }
}

["wheel", "touchstart", "pointerdown"].forEach((eventName) => {
  window.addEventListener(eventName, stopAnchorStabilization, { passive: true });
});
window.addEventListener("keydown", stopAnchorStabilization);

internalLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");
    if (!targetForHash(hash)) return;
    event.preventDefault();
    history.pushState(null, "", hash);
    navigateToHash(hash);
    if (mobileQuery.matches) setNavigationOpen(false);
    focusAnchorTarget(hash);
  });
});

window.addEventListener("hashchange", () => navigateToHash(location.hash, "auto"));
window.addEventListener("load", () => {
  if (location.hash) navigateToHash(location.hash, "auto");
});

const sectionObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => {
      const active = link.hash === `#${visible.target.id}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  },
  { rootMargin: "-18% 0px -68% 0px", threshold: [0.05, 0.25, 0.5] },
);
sections.forEach((section) => sectionObserver.observe(section));

detailsToggle?.addEventListener("click", () => {
  const collapse = detailsToggle.getAttribute("aria-pressed") !== "true";
  supportingDetails.forEach((detail) => {
    detail.open = !collapse;
  });
  detailsToggle.setAttribute("aria-pressed", String(collapse));
  detailsToggle.textContent = collapse ? "Expand details" : "Collapse details";
});


const MERMAID_CDN =
  "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs";

function showMermaidFailure(canvas, error) {
  canvas.replaceChildren();
  const message = document.createElement("p");
  message.className = "visual-loading";
  message.textContent =
    "Diagram rendering unavailable. Review the source fallback below.";
  canvas.append(message);
  canvas.closest(".mermaid-diagram")?.classList.add("render-failed");
  const source = document.getElementById(canvas.dataset.mermaidSource);
  const details = source?.closest("details");
  if (details) details.open = true;
  console.warn("A Mermaid diagram could not be rendered.", error);
}

function initMermaidZoom(canvas) {
  const svg = canvas.querySelector("svg");
  if (!svg) return;
  const viewBox = svg.viewBox.baseVal;
  const baseWidth = viewBox?.width || svg.getBoundingClientRect().width;
  svg.style.maxWidth = "none";
  svg.style.maxHeight = "none";
  let zoom = 1;
  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-toolbar";
  toolbar.innerHTML = `
    <button type="button" data-zoom="out" aria-label="Zoom diagram out">−</button>
    <span>100%</span>
    <button type="button" data-zoom="in" aria-label="Zoom diagram in">+</button>
    <button type="button" data-zoom="reset">Reset</button>
  `;
  const label = toolbar.querySelector("span");
  function setZoom(nextZoom) {
    zoom = Math.min(3, Math.max(0.5, nextZoom));
    svg.style.width = `${Math.round(baseWidth * zoom)}px`;
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
  }
  toolbar.addEventListener("click", (event) => {
    const action = event.target.dataset?.zoom;
    if (action === "in") setZoom(zoom + 0.25);
    if (action === "out") setZoom(zoom - 0.25);
    if (action === "reset") setZoom(1);
  });
  canvas.prepend(toolbar);
  setZoom(1);
}

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
        nodeSpacing: 90,
        rankSpacing: 120,
        curve: "basis",
      },
      themeVariables: {
        fontFamily: '"Avenir Next", Avenir, sans-serif',
        primaryColor: "#f7f9f7",
        primaryBorderColor: "#176b52",
        primaryTextColor: "#17201c",
        lineColor: "#176b52",
        tertiaryColor: "#dff3ea",
        clusterBkg: "transparent",
        clusterBorder: "transparent",
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
      const result = await mermaid.render(
        `prd-mermaid-${index + 1}`,
        source.textContent,
      );
      canvas.innerHTML = result.svg;
      initMermaidZoom(canvas);
      canvas.closest(".mermaid-diagram")?.classList.add("rendered");
      const details = source.closest("details");
      if (details) details.open = false;
    } catch (error) {
      showMermaidFailure(canvas, error);
    }
  }));
}

renderMermaidDiagrams();

let printDetailState = [];
window.addEventListener("beforeprint", () => {
  printDetailState = supportingDetails.map((detail) => detail.open);
  supportingDetails.forEach((detail) => {
    detail.open = true;
  });
});
window.addEventListener("afterprint", () => {
  supportingDetails.forEach((detail, index) => {
    detail.open = printDetailState[index];
  });
});

printButton?.addEventListener("click", () => window.print());
