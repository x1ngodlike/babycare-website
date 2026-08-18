// 在 vite build 之后运行：扫描 dist 产物，生成带内容哈希版本号的 dist/sw.js。
// 预缓存清单自动包含哈希 JS/CSS bundle 与常驻图标，不再手工维护。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const assetsDir = join(dist, 'assets');
const iconsDir = join(dist, 'icons');

const assets = readdirSync(assetsDir)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => `/assets/${file}`);
const topImages = readdirSync(dist)
  .filter((file) => /\.(png|jpg|jpeg|webp)$/.test(file))
  .map((file) => `/${file}`);
const shellIcons = readdirSync(iconsDir)
  .filter((file) => /^(nav-|quick-|record-|task-).*\.png$/.test(file))
  .map((file) => `/icons/${file}`);

const precache = ['/', '/manifest.webmanifest', ...assets, ...topImages, ...shellIcons];

const hash = createHash('sha1').update(precache.join('\n')).digest('hex').slice(0, 8);
const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
const output = template
  .replace('__CACHE_NAME__', JSON.stringify(`babycare-${hash}`))
  .replace('__PRECACHE_JSON__', JSON.stringify(precache, null, 2));

writeFileSync(join(dist, 'sw.js'), output);
console.log(`[build-sw] 预缓存 ${precache.length} 个资源（${assets.length} 个哈希产物），缓存版本 babycare-${hash}`);
