document.documentElement.classList.add("js");

const mobileQuery = window.matchMedia("(max-width: 900px)");
const sidebar = document.querySelector(".sidebar");
const navToggle = document.querySelector("#nav-toggle");
const sidebarPanel = document.querySelector("#sidebar-panel");
const navLinks = [...document.querySelectorAll(".sidebar nav a")];
const internalLinks = [...document.querySelectorAll('a[href^="#"]')];
const sections = [...document.querySelectorAll("main section[id]")];
const supportingDetails = [...document.querySelectorAll("details.supporting-detail")];
const detailsToggle = document.querySelector("#toggle-details");
const reviewButtons = [...document.querySelectorAll("[data-review-lens]")];
const reviewStatus = document.querySelector("#review-status");
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
  detailsToggle.textContent = collapse
    ? "Expand supporting detail"
    : "Collapse supporting detail";
});

const reviewLensCopy = {
  all: "Showing the complete document.",
  decisions: "Decision review lens selected. Related sections are emphasized.",
  validation: "Validation review lens selected. Related sections are emphasized.",
};

reviewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const lens = button.dataset.reviewLens;
    document.documentElement.dataset.reviewLens = lens;
    reviewButtons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    sections.forEach((section) => {
      const areas = section.dataset.reviewArea?.split(" ") ?? [];
      section.classList.toggle(
        "review-muted",
        lens !== "all" && !areas.includes("all") && !areas.includes(lens),
      );
    });
    reviewStatus.textContent = reviewLensCopy[lens];
  });
});

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
