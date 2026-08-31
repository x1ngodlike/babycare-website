// 在 vite build 之后运行：扫描 dist 产物，生成带内容哈希版本号的 dist/sw.js。
// 预缓存清单只包含应用外壳、通用图片和默认 Hero。其他主题由 Service Worker 按需缓存。
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
const appIconsDir = join(dist, 'app-icons');
const imagesDir = join(dist, 'images');
const heroDir = join(dist, 'hero');

const assets = readdirSync(assetsDir)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => `/assets/${file}`);
const appIconFiles = walkFiles(appIconsDir)
  .map((p) => `/${relative(dist, p).replace(/\\/g, '/')}`);
const imageFiles = walkFiles(imagesDir)
  .map((p) => `/${relative(dist, p).replace(/\\/g, '/')}`);
const heroFiles = walkFiles(heroDir)
  .map((p) => `/${relative(dist, p).replace(/\\/g, '/')}`)
  .filter((url) => url.startsWith('/hero/classic/default/') || url.startsWith('/hero/weather/shared/'));

const precache = ['/', '/manifest.webmanifest', ...assets, ...appIconFiles, ...imageFiles, ...heroFiles];

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
console.log(`[build-sw] 预缓存 ${precache.length} 个资源（${assets.length} 哈希产物 + ${appIconFiles.length} PWA 图标 + ${imageFiles.length} 公共图片 + ${heroFiles.length} 默认/共享 hero 资源），其他主题按需缓存，缓存版本 babycare-${hash}`);
