export function initDrawers() {
  const compact = matchMedia('(width < 1280px)');
  const panels = { articles: document.querySelector('#articles-panel'), toc: document.querySelector('#toc-panel') };
  const backdrop = document.querySelector('.drawer-backdrop');
  const main = document.querySelector('main');
  const header = document.querySelector('.site-header');
  let active = null, scrollY = 0, returnFocus = null, touch = null;
  const hasTOC = panels.toc.dataset.hasToc === 'true';
  function resetInert() {
    main.inert = header.inert = false;
    for (const panel of Object.values(panels)) panel.inert = compact.matches;
  }
  function close() {
    if (!active) { resetInert(); return; }
    const panel = panels[active];
    panel.classList.remove('is-open');
    panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); panel.removeAttribute('tabindex');
    backdrop.hidden = true;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    active = null; resetInert();
    document.querySelectorAll('[data-open-drawer]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    returnFocus?.focus({ preventScroll: true }); returnFocus = null;
  }
  function open(name, keyboard = false) {
    if (!compact.matches || (name === 'toc' && !hasTOC)) return;
    if (active) close();
    active = name; scrollY = window.scrollY;
    returnFocus = keyboard ? document.activeElement : null;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    backdrop.hidden = false;
    main.inert = header.inert = true;
    for (const [key, panel] of Object.entries(panels)) panel.inert = key !== name;
    const panel = panels[name];
    panel.classList.add('is-open'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    document.querySelector(`[data-open-drawer="${name}"]`)?.setAttribute('aria-expanded', 'true');
    if (keyboard) { panel.tabIndex = -1; panel.focus({ preventScroll: true }); }
  }
  backdrop.addEventListener('click', close);
  document.querySelectorAll('[data-open-drawer]').forEach(button => button.addEventListener('click', () => open(button.dataset.openDrawer, true)));
  for (const panel of Object.values(panels)) panel.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...panels[active].querySelectorAll('a, button, input, select, summary')].filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panels[active])) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panels[active])) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('touchstart', event => {
    touch = null;
    if (!compact.matches || document.querySelector('dialog[open]') || event.touches.length !== 1 || window.getSelection()?.toString()) return;
    if (event.target.closest('input, textarea, select, button, a, pre, table, [contenteditable], [data-horizontal-scroll]')) return;
    const point = event.touches[0];
    if (point.clientX < 24 || point.clientX > innerWidth - 24) return;
    touch = { x: point.clientX, y: point.clientY, dx: 0, dy: 0, horizontal: false };
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!touch) return;
    if (event.touches.length !== 1 || window.getSelection()?.toString()) { touch = null; return; }
    const point = event.touches[0];
    touch.dx = point.clientX - touch.x; touch.dy = point.clientY - touch.y;
    const x = Math.abs(touch.dx), y = Math.abs(touch.dy);
    if (!touch.horizontal && y > 12 && y * 1.6 > x) { touch = null; return; }
    const available = active ? ((active === 'articles' && touch.dx < 0) || (active === 'toc' && touch.dx > 0)) : (touch.dx > 0 || hasTOC);
    if (available && x > 12 && x > y * 1.6) { touch.horizontal = true; if (event.cancelable) event.preventDefault(); }
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (touch && Math.abs(touch.dx) >= 60 && Math.abs(touch.dx) > Math.abs(touch.dy) * 1.6) {
      if (active === 'articles' && touch.dx < 0 || active === 'toc' && touch.dx > 0) close();
      else if (!active) open(touch.dx > 0 ? 'articles' : 'toc');
    }
    touch = null;
  }, { passive: true });
  document.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  compact.addEventListener('change', close);
  window.addEventListener('orientationchange', close);
  window.addEventListener('pagehide', close);
  window.addEventListener('pageshow', close);
  resetInert();
  return { close };
}
