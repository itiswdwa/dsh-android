/* ============================================================================
 * DeepSeek Harness — Android / phone behaviour patch
 * ----------------------------------------------------------------------------
 * Companion to android-mobile.css. Upstream stores the narrow-viewport sidebar
 * expansion as a sticky boolean (stores.ts: layoutInfo.narrowExpanded, flipped
 * by actions.toggleSidebar when viewportWidth < 1024). Nothing in the client
 * knows how to *leave* that state, so once the drawer is open on a phone it
 * stays open over the conversation the user just picked. This script adds the
 * missing phone affordances without touching upstream state:
 *
 *   1. a scrim behind the drawer, tap to dismiss
 *   2. picking a session in the drawer dismisses it
 *   3. window.__dshmBack() — Android hardware back button hook, returns true
 *      when it consumed the gesture
 *
 * It only reads the frame's own `data-sidebar-collapsed` attribute, i.e. it
 * observes upstream state instead of duplicating it.
 * ========================================================================== */
(function () {
  "use strict";

  var NARROW = 1024;

  function frame() {
    return document.querySelector('[class*="_frame"][style*="grid-template-columns"]') ||
      document.querySelector('[class*="_frame"]');
  }

  function isNarrow() {
    return window.innerWidth < NARROW;
  }

  function drawerOpen() {
    var el = frame();
    return el !== null && !el.hasAttribute("data-sidebar-collapsed");
  }

  function toggleButton() {
    var el = frame();
    if (el === null) return null;
    // The sidebar header owns the (collapse) toggle; its class suffix is stable
    // across builds while the CSS-module hash is not.
    var buttons = el.querySelectorAll('[class*="_sidebarCol"] [class*="_toggle"]');
    return buttons.length > 0 ? buttons[buttons.length - 1] : null;
  }

  function dismissDrawer() {
    if (!isNarrow() || !drawerOpen()) return false;
    var button = toggleButton();
    if (button === null) return false;
    button.click();
    return true;
  }

  /* --- 1/2. scrim + session-pick dismissal ------------------------------- */

  function sync() {
    var open = isNarrow() && drawerOpen();
    document.documentElement.classList.toggle("dshm-drawer-open", open);
  }

  function install() {
    if (document.querySelector(".dshm-scrim") !== null) return;
    var scrim = document.createElement("div");
    scrim.className = "dshm-scrim";
    scrim.setAttribute("aria-hidden", "true");
    scrim.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      dismissDrawer();
    });
    document.body.appendChild(scrim);

    // Any click on a session row inside the drawer selects that session; the
    // drawer has done its job and should get out of the way.
    document.addEventListener(
      "click",
      function (event) {
        if (!isNarrow() || !drawerOpen()) return;
        var target = event.target;
        if (!(target instanceof Element)) return;
        var col = frame() && frame().querySelector('[class*="_sidebarCol"]');
        if (col === null || !col.contains(target)) return;
        if (target.closest('[class*="_sessionRow"]') === null) return;
        window.setTimeout(function () {
          dismissDrawer();
        }, 0);
      },
      true
    );
  }

  /* --- 3. state observation --------------------------------------------- */

  function observe() {
    var root = document.body;
    new MutationObserver(sync).observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-sidebar-collapsed", "style", "class"]
    });
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("orientationchange", sync, { passive: true });
    sync();
  }

  /* --- Android hardware back button ------------------------------------- */

  window.__dshmBack = function () {
    if (dismissDrawer()) return true;
    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
    return false;
  };

  function start() {
    install();
    observe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
