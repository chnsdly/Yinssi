import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

export const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const cacheDir = path.join(root, '.cache');
export const isMain = url => process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
export async function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '', stderr = '';
    child.stdout?.on('data', b => { stdout += b; });
    child.stderr?.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} (${code})\n${stdout}\n${stderr}`)));
  });
}
export async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const lists = await Promise.all(entries.map(async e => {
    if (e.isSymbolicLink()) throw new Error(`不允许符号链接：${path.join(directory, e.name)}`);
    return e.isDirectory() ? filesIn(path.join(directory, e.name)) : [path.join(directory, e.name)];
  }));
  return lists.flat();
}
export function inside(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
export async function cleanOutput(target) {
  const absolute = path.resolve(target);
  const publicDir = path.join(root, 'public');
  if (absolute !== publicDir && !inside(cacheDir, absolute)) throw new Error(`拒绝清理非输出目录：${absolute}`);
  // Resolve existing ancestors so a symlink cannot redirect a recursive deletion.
  let current = absolute;
  while (current !== root) {
    const info = await fs.lstat(current).catch(() => null);
    if (info?.isSymbolicLink()) throw new Error(`拒绝清理链接目录：${current}`);
    current = path.dirname(current);
  }
  await fs.rm(absolute, { recursive: true, force: true });
  await fs.mkdir(absolute, { recursive: true });
}
