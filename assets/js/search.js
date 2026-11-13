export function initSearch(drawers) {
  const dialog = document.querySelector('#site-search');
  const input = dialog.querySelector('#site-search-input');
  const status = dialog.querySelector('.search-status');
  const list = dialog.querySelector('.search-result-list');
  const scroll = dialog.querySelector('.search-results-scroll');
  const more = dialog.querySelector('.search-more');
  const clear = dialog.querySelector('.search-clear');
  let engine, timer, opener, readingY = 0, composing = false, epoch = 0, results = [], shown = 0;

  function highlightedExcerpt(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    // Keep only text and Pagefind's highlight marks in the result snippet.
    template.content.querySelectorAll('script, style, template').forEach(element => element.remove());
    for (const element of template.content.querySelectorAll('*')) {
      if (element.localName !== 'mark') element.replaceWith(...element.childNodes);
      else for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    }
    return template.content;
  }

  async function renderBatch(token) {
    more.disabled = true;
    try {
      const batch = await Promise.all(results.slice(shown, shown + 20).map(result => result.data()));
      if (token !== epoch || !dialog.open) return;
      const fragment = document.createDocumentFragment();
      for (const result of batch) {
        const url = new URL(result.url, location.origin);
        if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) continue;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'search-result-link';
        link.href = url.pathname + url.hash;
        const title = document.createElement('h3');
        title.className = 'search-result-title';
        title.textContent = result.meta.title;
        link.append(title);
        if (result.excerpt || result.plain_excerpt) {
          const excerpt = document.createElement('p');
          excerpt.className = 'search-result-excerpt';
          excerpt.append(highlightedExcerpt(result.excerpt || result.plain_excerpt));
          link.append(excerpt);
        }
        item.append(link); fragment.append(item);
      }
      list.append(fragment);
      shown += batch.length;
      more.hidden = shown >= results.length;
    } finally { if (token === epoch) more.disabled = false; }
  }

  function failure(token) {
    if (token !== epoch || !dialog.open) return;
    status.textContent = '搜索暂时不可用。你仍可关闭面板，按年份浏览文章。';
    list.replaceChildren(); more.hidden = true;
    engine = undefined;
  }

  async function search() {
    const token = ++epoch;
    const query = input.value.trim();
    clear.hidden = !input.value;
    list.replaceChildren(); more.hidden = true;
    scroll.hidden = !query && !input.disabled;
    scroll.scrollTop = 0;
    if (input.disabled) { status.textContent = '暂无已发布文章。'; return; }
    if (!query) {
      status.textContent = '';
      return;
    }
    status.textContent = '正在查找…';
    try {
      engine ||= import('/pagefind/pagefind.js').catch(error => { engine = undefined; throw error; });
      const pagefind = await engine;
      const response = await pagefind.search(query);
      if (token !== epoch || !dialog.open) return;
      results = response.results; shown = 0;
      status.textContent = results.length ? `找到 ${results.length} 篇文章` : '没有找到相关的文章。';
      await renderBatch(token);
    } catch { failure(token); }
  }

  function open(trigger) {
    if (dialog.open) return;
    drawers.close();
    opener = trigger;
    readingY = window.scrollY;
    clearTimeout(timer); composing = false;
    input.value = '';
    document.documentElement.classList.add('search-open');
    dialog.showModal();
    search();
    if (!input.disabled) input.focus({ preventScroll: true });
  }

  function schedule() {
    clearTimeout(timer); ++epoch; clear.hidden = !input.value;
    if (!composing && dialog.open) timer = setTimeout(search, 250);
  }

  document.querySelectorAll('[data-open-search]').forEach(trigger => trigger.addEventListener('click', () => open(trigger)));
  dialog.querySelector('.search-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearTimeout(timer); ++epoch; composing = false;
    document.documentElement.classList.remove('search-open');
    window.scrollTo({ top: readingY, behavior: 'instant' });
    const canRestore = opener && !opener.closest('[inert]') && opener.getClientRects().length && getComputedStyle(opener).visibility !== 'hidden';
    (canRestore ? opener : document.querySelector('main')).focus({ preventScroll: true });
    opener = null;
  });
  const outside = event => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  let backdropPressed = false;
  dialog.addEventListener('pointerdown', event => { backdropPressed = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => { if (backdropPressed && event.target === dialog && outside(event)) dialog.close(); backdropPressed = false; });
  input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); ++epoch; });
  input.addEventListener('compositionend', () => { composing = false; schedule(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); dialog.close(); }
  });
  input.addEventListener('input', schedule);
  clear.addEventListener('click', () => { input.value = ''; clearTimeout(timer); search(); input.focus(); });
  more.addEventListener('click', () => { const token = epoch; renderBatch(token).catch(() => failure(token)); });
  list.addEventListener('click', event => {
    if (event.target.closest('a') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) dialog.close();
  });
  window.addEventListener('pagehide', () => { if (dialog.open) dialog.close(); });
}
