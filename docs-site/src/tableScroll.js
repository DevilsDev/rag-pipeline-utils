// A table box that scrolls sideways (the .table-scroll boxes added by
// src/lib/rehypeTables.js) can take keyboard focus, so it can be scrolled
// with the arrow keys. Boxes that fit are left out of the tab order. The
// boxes scroll without this; it only adds the focus.
function update() {
  for (const box of document.querySelectorAll(".table-scroll")) {
    if (box.scrollWidth > box.clientWidth) {
      box.tabIndex = 0;
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", "Table, scrolls sideways");
    } else {
      box.removeAttribute("tabindex");
      box.removeAttribute("role");
      box.removeAttribute("aria-label");
    }
  }
}

export function onRouteDidUpdate() {
  window.requestAnimationFrame(update);
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", update);
}
