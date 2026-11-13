import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { root, filesIn, isMain } from './lib.mjs';

export function parseArticle(text, filename) {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${filename}：需要 YAML 元信息（以 --- 分隔）`);
  return { data: parse(match[1]), body: match[2] };
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const date = new Date(value);
  if (!Number.isFinite(+date)) return false;
  const offset = value.endsWith('Z') ? 0 : ((value.at(-6) === '-' ? -1 : 1) * (Number(value.slice(-5,-3)) * 60 + Number(value.slice(-2))));
  return new Date(+date + offset * 60000).toISOString().slice(0,19) === value.slice(0,19);
}
export function published(data, now = Date.now()) {
  return data.draft === false && +new Date(data.date) <= now && (!data.expiryDate || +new Date(data.expiryDate) > now);
}
export async function verifyContent(contentDir = path.join(root, 'content')) {
  const files = await filesIn(contentDir);
  const articles = [], errors = [];
  const now = Date.now();
  for (const file of files.filter(file => file.endsWith('.md'))) {
    const relative = path.relative(contentDir, file).replaceAll('\\', '/');
    try {
      const match = relative.match(/^posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.md$/);
      if (!match) throw new Error('请使用 content/posts/小写英文-slug/index.md 结构');
      const slug = match[1];
      const { data, body } = parseArticle(await fs.readFile(file, 'utf8'), relative);
      if (!data || typeof data !== 'object') throw new Error('元信息不是有效对象');
      if (typeof data.title !== 'string' || !data.title.trim()) throw new Error('title 必须是非空标题');
      if (!validDate(data.date)) throw new Error('date 必须是真实日期及带时区的时间，如 2026-11-12T09:00:00+08:00');
      if (typeof data.draft !== 'boolean') throw new Error('draft 必须显式写为 true 或 false');
      if (data.expiryDate && !validDate(data.expiryDate)) throw new Error('expiryDate 格式无效');
      if (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string')) throw new Error('tags 必须是字符串列表，可以为空 []');
      const allowed = new Set(['title','date','draft','tags','expiryDate']);
      for (const field of Object.keys(data)) if (!allowed.has(field)) throw new Error(`不支持元信息字段 ${field}，请保持文章结构简单`);
      const included = published(data, now);
      const bundle = path.dirname(file);
      data.tags = [...new Set(data.tags.map(tag => tag.trim()).filter(Boolean))];
      data.title = data.title.trim();
      // A normalized build copy makes all grouping use Beijing time, irrespective of authored offset.
      data.date = new Date(+new Date(data.date) + 8 * 3600000).toISOString().slice(0,19) + '+08:00';
      articles.push({ file, slug, bundle, data, body, included });
    } catch (error) { errors.push(`${relative}：${error.message}`); }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return articles;
}
if (isMain(import.meta.url)) verifyContent().then(articles => console.log(`内容检查通过：${articles.length} 篇内容，${articles.filter(p => p.included).length} 篇可构建。`)).catch(error => { console.error(error.message); process.exitCode = 1; });
