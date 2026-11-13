import fs from 'node:fs/promises';
import path from 'node:path';
import { filesIn, inside } from './lib.mjs';

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = value => value.replace(/&(#(?:[xX][\da-fA-F]+|\d+)|amp|lt|gt|quot|apos);/g, (_, entity) => {
  if (entity[0] !== '#') return entities[entity];
  const hex = /^[xX]/.test(entity.slice(1));
  const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
  return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
});

function readHTML(html) {
  const ids = [], references = [];
  // Read Hugo's generated tags, excluding comments and raw-text contents.
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^"'<>])*)>/gi;
  const attributes = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=\x60<>]+)))?/g;
  let tag;
  while ((tag = tags.exec(html))) {
    if (!tag[1]) continue;
    for (const attribute of tag[2].matchAll(attributes)) {
      const name = attribute[1].toLowerCase();
      if (!['id', 'href', 'src'].includes(name)) continue;
      const value = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      (name === 'id' ? ids : references).push(value);
    }
    const name = tag[1].toLowerCase();
    if (['script', 'style', 'textarea', 'title'].includes(name)) {
      const end = new RegExp(`</${name}\\s*>`, 'gi');
      end.lastIndex = tags.lastIndex;
      tags.lastIndex = end.exec(html) ? end.lastIndex : html.length;
    }
  }
  return { ids, references };
}
export async function verifyOutput(output, articles, { baseURL = 'http://127.0.0.1:1313/' } = {}) {
  const all = await filesIn(output), htmlFiles = all.filter(file => file.endsWith('.html'));
  const fileSet = new Set(all);
  const expected = articles.filter(article => article.included);
  const pageMap = new Map(await Promise.all(htmlFiles.map(async file => [file, readHTML(await fs.readFile(file, 'utf8'))])));
  const idMap = new Map([...pageMap].map(([file,page]) => [file, new Set(page.ids)]));
  const errors = [];
  if (htmlFiles.length !== expected.length + 2) errors.push(`页面数不符：期望 ${expected.length + 2}，实际 ${htmlFiles.length}`);
  for (const file of all) {
    if (/\.(md|toml|yaml|yml|mjs)$/i.test(file)) errors.push(`不应输出源文件：${file}`);
    if (/[/\\](?:tags|categories|archives|about|contact|\.cache|node_modules)[/\\]/.test(path.relative(output, file))) errors.push(`不应输出额外目录：${file}`);
  }
  for (const article of articles) {
    const route = path.join(output, 'posts', article.slug, 'index.html');
    if (article.included && !pageMap.has(route)) errors.push(`缺少文章页面：${article.slug}`);
    if (!article.included && all.some(file => inside(path.join(output, 'posts', article.slug), file))) errors.push(`未发布内容泄漏：${article.slug}`);
  }
  for (const [file, { ids, references }] of pageMap) {
    if (new Set(ids).size !== ids.length) errors.push(`重复锚点：${file}`);
    const relativeRoute = path.relative(output, file).replaceAll('\\', '/').replace(/index\.html$/, '');
    const pageURL = new URL(relativeRoute, baseURL);
    for (const reference of references) {
      if (/^(mailto:|tel:|data:)/i.test(reference)) continue;
      let url;
      try { url = new URL(reference, pageURL); } catch { errors.push(`无效链接 ${reference} (${file})`); continue; }
      if (url.origin !== new URL(baseURL).origin) continue;
      let destination;
      try { destination = path.join(output, decodeURIComponent(url.pathname)); } catch { errors.push(`无效编码 ${reference}`); continue; }
      if (url.pathname.endsWith('/')) destination = path.join(destination, 'index.html');
      if (!inside(output, destination)) { errors.push(`越界链接：${reference}`); continue; }
      if (!fileSet.has(destination)) { errors.push(`本地链接不存在：${reference} (${path.relative(output, file)})`); continue; }
      if (url.hash && pageMap.has(destination)) {
        let id; try { id = decodeURIComponent(url.hash.slice(1)); } catch { id = ''; }
        if (!idMap.get(destination).has(id)) errors.push(`锚点不存在：${reference} (${file})`);
      }
    }
  }
  if (errors.length) throw new Error(errors.slice(0,30).join('\n'));
  return { pages: htmlFiles.length, articles: expected.length, files: all.length };
}
