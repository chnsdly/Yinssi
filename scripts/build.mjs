import fs from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import * as pagefind from 'pagefind';
import { root, cacheDir, run, cleanOutput, isMain, inside } from './lib.mjs';
import { verifyContent } from './verify-content.mjs';
import { verifyOutput } from './verify-output.mjs';

export async function build({ output = path.join(root, 'public'), baseURL = process.env.SITE_BASE_URL || 'http://127.0.0.1:1313/' } = {}) {
  const started = performance.now();
  if (!/^24\./.test(process.versions.node)) throw new Error('请使用 Node.js 24。');
  const base = new URL(baseURL);
  if (!['http:','https:'].includes(base.protocol) || base.pathname !== '/' || base.username || base.password || base.search || base.hash) throw new Error('网站基址应为 http(s)://主机/，不包含子路径或其他参数。');
  await run('hugo', ['version']);
  const articles = await verifyContent(path.join(root, 'content'));
  await cleanOutput(output);
  const staging = path.join(cacheDir, `input-${path.basename(output)}`);
  await cleanOutput(staging);
  for (const article of articles.filter(article => article.included)) {
    const destination = path.join(staging, 'posts', article.slug);
    await fs.cp(article.bundle, destination, { recursive: true });
    await fs.writeFile(path.join(destination, 'index.md'), `---\n${stringify(article.data)}---\n${article.body}`);
  }
  const outputLog = await run('hugo', [
    '--config', 'hugo.toml', '--environment', 'production',
    '--contentDir', staging, '--destination', output,
    '--baseURL', base.href, '--buildDrafts=false', '--buildFuture=false', '--buildExpired=false',
    '--minify', '--panicOnWarning', '--noBuildLock', '--cacheDir', path.join(cacheDir,'hugo'),
  ], { env: { ...process.env, HUGO_PARAMS_CANONICAL: String(Boolean(process.env.SITE_BASE_URL)) } });
  const included = articles.filter(article => article.included);
  if (included.length) {
    const { index, errors } = await pagefind.createIndex({ forceLanguage: 'zh-CN' });
    if (errors.length) throw new Error(errors.join('\n'));
    try {
      const indexed = await index.addDirectory({ path: output, glob: 'posts/**/index.html' });
      if (indexed.errors.length) throw new Error(indexed.errors.join('\n'));
      if (indexed.page_count !== included.length) throw new Error(`搜索索引数量错误：${indexed.page_count}/${included.length}`);
      // Let Node write the API's buffers: avoids native concurrent flush failures on Windows.
      const result = await index.getFiles();
      if (result.errors.length) throw new Error(result.errors.join('\n'));
      const searchDir = path.join(output, 'pagefind');
      for (const file of result.files) {
        if (/^pagefind-(ui|modular-ui|component-ui|highlight)\./.test(file.path)) continue;
        const destination = path.resolve(searchDir, file.path);
        if (!inside(searchDir, destination)) throw new Error('搜索索引路径越界');
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, file.content);
      }
    } finally { await pagefind.close(); }
  }
  const report = await verifyOutput(output, articles, { baseURL });
  report.seconds = Number(((performance.now() - started) / 1000).toFixed(2));
  console.log(`构建完成：${report.articles} 篇文章，${report.files} 个文件，${report.seconds} 秒。`);
  return { ...report, output, outputLog };
}
if (isMain(import.meta.url)) build().catch(error => { console.error(error.message); process.exitCode = 1; });
