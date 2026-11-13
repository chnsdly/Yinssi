export function initNavigation() {
  const tree = document.querySelector('#article-tree');
  const scroll = document.querySelector('#navigation-scroll');
  const browser = document.querySelector('.tag-browser');
  const toggle = browser.querySelector('.tag-toggle');
  const label = browser.querySelector('.tag-label');
  const index = browser.querySelector('#tag-index');
  const reset = browser.querySelector('.tag-reset');
  const status = document.querySelector('#filter-status');
  const home = Boolean(document.querySelector('.home-space'));
  const options = [...index.querySelectorAll('button[data-tag]')];
  const tags = new Set(['', ...options.map(option => option.dataset.tag)]);
  const key = 'yinsi:navigation:v1:content';
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(key)); } catch {}
  const groups = [...tree.querySelectorAll(':scope > .year-group')];
  const entries = [...tree.querySelectorAll('li[data-tags]')].map(element => ({ element, tags: JSON.parse(element.dataset.tags) || [] }));
  let restoring = true;
  let tag = tags.has(saved?.tag) ? saved.tag : '';
  const scrollValue = value => Number.isFinite(value) && value >= 0 ? value : 0;

  function snapshot() {
    return { groups: Object.fromEntries(groups.map(group => [group.dataset.group, group.open])), scroll: scroll.scrollTop };
  }
  function restoreGroups(values) {
    for (const group of groups) {
      const open = values?.[group.dataset.group];
      if (typeof open === 'boolean') group.open = open;
    }
  }
  restoreGroups(saved?.tag && !tag ? (saved.archive?.groups || saved.groups) : saved?.groups);
  let archive = tag ? { groups: saved?.archive?.groups || snapshot().groups, scroll: scrollValue(saved?.archive?.scroll) } : null;
  const fromSite = (() => { try { return new URL(document.referrer).origin === location.origin; } catch { return false; } })();
  const current = tree.querySelector('[aria-current="page"]');
  if (home) {
    // Home is a fresh starting point, regardless of the saved reading state.
    tag = ''; archive = null;
    for (const group of groups) group.open = false;
  } else if (current && (!saved || !fromSite)) {
    // Direct links always reveal the article, even after an earlier filtered visit.
    if (archive) restoreGroups(archive.groups);
    tag = ''; archive = null;
    current.closest('.year-group').open = true;
  }
  function persist() {
    if (restoring) return;
    try { sessionStorage.setItem(key, JSON.stringify({ ...snapshot(), tag, archive })); } catch {}
  }
  function filter(announce = false) {
    label.textContent = tag || '按标签浏览';
    toggle.classList.toggle('is-filtered', Boolean(tag));
    toggle.setAttribute('aria-label', tag ? `按标签浏览，当前标签：${tag}` : '按标签浏览');
    reset.hidden = !tag;
    for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.tag === tag));
    let total = 0;
    for (const { element, tags } of entries) {
      element.hidden = Boolean(tag && !tags.includes(tag));
      if (!element.hidden) total++;
    }
    for (const group of groups) {
      const count = group.querySelectorAll(':scope > .article-list > li:not([hidden])').length;
      group.hidden = count === 0;
      group.querySelector(':scope > summary .group-count').textContent = count;
    }
    if (announce) status.textContent = tag ? `“${tag}”下有 ${total} 篇文章。` : `全部 ${total} 篇文章。`;
  }
  function expand(open, focus = false) {
    index.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      const selected = options.find(option => option.dataset.tag === tag);
      if (selected) index.scrollTop += selected.getBoundingClientRect().top - index.getBoundingClientRect().top - 8;
      else index.scrollTop = 0;
    }
    if (focus) toggle.focus({ preventScroll: true });
  }
  function choose(next) {
    if (!tags.has(next)) return;
    if (next === tag) { expand(false, true); return; }
    // Keep the full archive untouched while browsing a tag, including across articles.
    if (!tag) archive = snapshot();
    const previous = archive;
    tag = next;
    filter(true);
    if (tag) {
      for (const group of groups) if (!group.hidden) group.open = true;
    } else {
      restoreGroups(previous?.groups);
      archive = null;
    }
    expand(false, true);
    scroll.scrollTop = tag ? 0 : scrollValue(previous?.scroll);
    persist();
  }

  toggle.addEventListener('click', () => expand(index.hidden));
  reset.addEventListener('click', () => choose(''));
  for (const option of options) option.addEventListener('click', () => choose(option.dataset.tag === tag ? '' : option.dataset.tag));
  browser.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !index.hidden) {
      event.preventDefault(); event.stopPropagation();
      expand(false, true);
    }
  });
  filter();
  // Older saved sessions did not store the unfiltered archive separately.
  if (tag && !saved?.archive) for (const group of groups) if (!group.hidden) group.open = true;
  requestAnimationFrame(() => {
    if (home) scroll.scrollTop = 0;
    else if (saved && fromSite) scroll.scrollTop = scrollValue(saved.scroll);
    else if (current && !current.closest('li').hidden) {
      const offset = current.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      if (offset > scroll.clientHeight - 80) scroll.scrollTop = offset - 100;
    }
    restoring = false;
    persist();
  });
  tree.addEventListener('toggle', persist, true);
  let frame;
  scroll.addEventListener('scroll', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(persist); }, { passive: true });
  window.addEventListener('pagehide', () => { expand(false); persist(); });
  document.addEventListener('click', event => {
    if (!browser.contains(event.target)) expand(false);
    if (event.target.closest('a[href]')) persist();
  });
}
