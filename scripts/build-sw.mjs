// 在 vite build 之后运行：扫描 dist 产物，生成带内容哈希版本号的 dist/sw.js。
// 预缓存清单自动包含哈希 JS/CSS bundle、常驻图标、hero 主题资源，不再手工维护。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

function walkFiles(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else if (e.isFile() && !e.name.startsWith('.')) out.push(p);
  }
  return out;
}

const dist = resolve('dist');
const assetsDir = join(dist, 'assets');
const iconsDir = join(dist, 'icons');
const heroDir = join(dist, 'hero');

const assets = readdirSync(assetsDir)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => `/assets/${file}`);
const topImages = readdirSync(dist)
  .filter((file) => /\.(png|jpg|jpeg|webp)$/.test(file))
  .map((file) => `/${file}`);
const shellIcons = readdirSync(iconsDir)
  .filter((file) => /^(nav-|quick-|record-|task-).*\.png$/.test(file))
  .map((file) => `/icons/${file}`);
const heroFiles = walkFiles(heroDir)
  .map((p) => '/' + relative(dist, p).replace(/\\/g, '/'));

const precache = ['/', '/manifest.webmanifest', ...assets, ...topImages, ...shellIcons, ...heroFiles];

const versionSource = precache.map((url) => {
  const file = url === '/' ? join(dist, 'index.html') : join(dist, url.slice(1));
  const contentHash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 12);
  return `${url}:${contentHash}`;
}).join('\n');
const hash = createHash('sha1').update(versionSource).digest('hex').slice(0, 8);
const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
const output = template
  .replace('__CACHE_NAME__', JSON.stringify(`babycare-${hash}`))
  .replace('__PRECACHE_JSON__', JSON.stringify(precache, null, 2));

writeFileSync(join(dist, 'sw.js'), output);
console.log(`[build-sw] 预缓存 ${precache.length} 个资源（${assets.length} 哈希产物 + ${heroFiles.length} hero 主题），缓存版本 babycare-${hash}`);
