document.documentElement.classList.add("js");

const mobileQuery = window.matchMedia("(max-width: 980px)");
const sidebar = document.querySelector(".sidebar");
const navToggle = document.querySelector("#nav-toggle");
const sidebarPanel = document.querySelector("#sidebar-panel");
const navigation = document.querySelector(".sidebar nav");
const navLinks = [...document.querySelectorAll(".sidebar nav a")];
const sections = [...document.querySelectorAll("main > section[id]")];
const supportingDetails = [...document.querySelectorAll("details")];
const detailsToggle = document.querySelector("#collapse-all");
const printButton = document.querySelector("#print-document");
let anchorObserver;

const categoryLabels = {
  framing: "Context",
  "people-workflow": "People & workflow",
  "product-definition": "Product contract",
  "visual-experience": "Visual experience",
  "technical-contracts": "Technical contracts",
  "delivery-assurance": "Assurance & evidence",
};

function navigationIsOpen() {
  return navToggle?.getAttribute("aria-expanded") === "true";
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
  document.body.classList.toggle("navigation-open", open);
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

function categoryLabel(category) {
  return categoryLabels[category] || "Document";
}

function addSectionCategoryLabels() {
  sections.forEach((section) => {
    const heading = section.querySelector(".section-heading");
    if (!heading || heading.querySelector(".section-category")) return;
    const label = document.createElement("span");
    label.className = "section-category";
    label.textContent = categoryLabel(section.dataset.blockCategory);
    heading.prepend(label);
  });
}

function buildReviewOverview() {
  const hero = document.querySelector(".hero");
  if (!hero || document.querySelector(".review-overview")) return;

  const requirementItems = [
    ...document.querySelectorAll("#requirements article"),
  ];
  const validatedRequirements = requirementItems.filter((item) =>
    item.querySelector('a[href^="#test-"]'),
  ).length;
  const openQuestions = document.querySelectorAll(
    "#open_questions article",
  ).length;
  const risks = document.querySelectorAll("#risks article").length;
  if (!requirementItems.length && !openQuestions && !risks) return;

  const overview = document.createElement("aside");
  overview.className = "review-overview";
  overview.setAttribute("aria-labelledby", "review-overview-title");
  overview.innerHTML = `
    <div class="review-overview-intro">
      <span class="review-overview-eyebrow">Review focus</span>
      <h2 id="review-overview-title">Move from context to decision.</h2>
      <p>Resolve open questions, challenge material risks, then confirm validation coverage.</p>
    </div>
    <a class="review-stat review-stat--questions" href="#open_questions">
      <strong>${openQuestions}</strong>
      <span>Open ${openQuestions === 1 ? "question" : "questions"}</span>
    </a>
    <a class="review-stat" href="#risks">
      <strong>${risks}</strong>
      <span>Known ${risks === 1 ? "risk" : "risks"}</span>
    </a>
    <a class="review-stat" href="#testing_strategy">
      <strong>${validatedRequirements}/${requirementItems.length}</strong>
      <span>Requirements validated</span>
    </a>
  `;
  hero.after(overview);
}

function groupNavigation() {
  if (!navigation || navigation.classList.contains("is-grouped")) return;

  const summaryLink = navLinks.find((link) => link.hash === "#summary");
  const groups = new Map();
  navLinks.forEach((link) => {
    if (link === summaryLink) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    const category = target.dataset.blockCategory || "document";
    link.dataset.reviewArea = target.dataset.reviewArea || "all";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(link);
  });

  navigation.replaceChildren();
  navigation.classList.add("is-grouped");
  if (summaryLink) {
    summaryLink.classList.add("nav-summary-link");
    navigation.append(summaryLink);
  }

  const groupsContainer = document.createElement("div");
  groupsContainer.className = "nav-groups";
  const groupElements = [];
  groups.forEach((links, category) => {
    const group = document.createElement("div");
    group.className = "nav-group";
    group.dataset.reviewCategory = category;
    const label = document.createElement("span");
    label.className = "nav-group-label";
    label.textContent = categoryLabel(category);
    group.append(label, ...links);
    groupsContainer.append(group);
    groupElements.push(group);
  });
  navigation.append(groupsContainer);

  if (!sidebarPanel || !groupElements.length) return;
  const lenses = document.createElement("div");
  lenses.className = "review-lenses";
  lenses.setAttribute("role", "group");
  lenses.setAttribute("aria-label", "Filter document navigation");
  lenses.innerHTML = `
    <span>Review lens</span>
    <button type="button" data-review-lens="all" aria-pressed="true">All</button>
    <button type="button" data-review-lens="decisions" aria-pressed="false">Decisions</button>
    <button type="button" data-review-lens="validation" aria-pressed="false">Validation</button>
    <span class="review-lens-status sr-only" aria-live="polite"></span>
  `;
  sidebarPanel.prepend(lenses);

  const lensButtons = [...lenses.querySelectorAll("[data-review-lens]")];
  const lensStatus = lenses.querySelector(".review-lens-status");
  function applyReviewLens(lens) {
    navLinks.forEach((link) => {
      if (link === summaryLink) {
        link.hidden = false;
        return;
      }
      const reviewAreas = (link.dataset.reviewArea || "all").split(/\s+/);
      link.hidden = lens !== "all"
        && !reviewAreas.includes("all")
        && !reviewAreas.includes(lens);
    });
    groupElements.forEach((group) => {
      group.hidden = ![...group.querySelectorAll("a")].some(
        (link) => !link.hidden,
      );
    });
    lensButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.reviewLens === lens),
      );
    });
    const visibleCount = navLinks.filter(
      (link) => link !== summaryLink && !link.hidden,
    ).length;
    if (lensStatus) {
      lensStatus.textContent = lens === "all"
        ? `Showing all ${visibleCount} document sections.`
        : `Showing ${visibleCount} ${lens} sections.`;
    }
  }

  lenses.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-review-lens]");
    if (!button) return;
    applyReviewLens(button.dataset.reviewLens);
  });
}

function makeTablesResponsive() {
  document.querySelectorAll(".table-wrap table").forEach((table) => {
    const labels = [...table.querySelectorAll("thead th")]
      .map((header) => header.textContent.trim());
    if (!labels.length) return;
    table.classList.add("responsive-table");
    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        cell.dataset.label = labels[index] || "";
        if (!cell.querySelector(":scope > .responsive-cell-content")) {
          const content = document.createElement("span");
          content.className = "responsive-cell-content";
          content.append(...cell.childNodes);
          cell.append(content);
        }
      });
    });
  });
}

addSectionCategoryLabels();
buildReviewOverview();
groupNavigation();
makeTablesResponsive();

function headerOffset() {
  return sidebar ? sidebar.getBoundingClientRect().height : 0;
}

function anchorScrollTop(target) {
  if (target.id === "summary") return 0;
  return target.getBoundingClientRect().top + window.scrollY - headerOffset();
}

function positionAnchor(target, behavior = "auto") {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: Math.max(0, anchorScrollTop(target)),
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

document.addEventListener("click", (event) => {
  const link = event.target.closest?.('a[href^="#"]');
  if (!link) return;
  const hash = link.getAttribute("href");
  if (!targetForHash(hash)) return;
  event.preventDefault();
  history.pushState(null, "", hash);
  navigateToHash(hash);
  setNavigationOpen(false);
  focusAnchorTarget(hash);
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
        fontFamily: '"Helvetica Neue", "Avenir Next", sans-serif',
        primaryColor: "#fbfbff",
        primaryBorderColor: "#114d83",
        primaryTextColor: "#17182c",
        lineColor: "#114d83",
        tertiaryColor: "#e4e7ff",
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
