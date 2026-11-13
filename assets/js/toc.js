export function initTOC() {
  const links = [...document.querySelectorAll('#TableOfContents a')];
  if (!links.length) return;
  const sections = links.map(link => ({ link, heading: document.getElementById(decodeURIComponent(link.hash.slice(1))) })).filter(item => item.heading);
  let scheduled = false, last;
  function update() {
    scheduled = false;
    const threshold = document.querySelector('.site-header').getBoundingClientRect().height + 64;
    let current = sections[0];
    for (const section of sections) {
      if (section.heading.getBoundingClientRect().top <= threshold) current = section;
      else break;
    }
    if (current === last) return;
    last?.link.removeAttribute('aria-current');
    current?.link.setAttribute('aria-current', 'location');
    last = current;
  }
  window.addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}
