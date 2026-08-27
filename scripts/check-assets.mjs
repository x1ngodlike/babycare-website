import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const projectRoot = resolve('.');
const publicRoot = join(projectRoot, 'public');
const failures = [];
const checkedImages = new Set();

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name.startsWith('.')) {
      failures.push(`禁止隐藏文件或目录进入 public：${relative(publicRoot, path)}`);
      return [];
    }
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function requireFile(path, label = relative(publicRoot, path)) {
  if (!existsSync(path)) failures.push(`缺少资源：${label}`);
}

async function checkImage(path, { width, height, alpha, format = 'webp' } = {}) {
  if (checkedImages.has(path)) return;
  checkedImages.add(path);
  try {
    const metadata = await sharp(path).metadata();
    const label = relative(publicRoot, path);
    if (format && metadata.format !== format) failures.push(`${label} 格式应为 ${format}，实际为 ${metadata.format}`);
    if (width && metadata.width !== width) failures.push(`${label} 宽度应为 ${width}，实际为 ${metadata.width}`);
    if (height && metadata.height !== height) failures.push(`${label} 高度应为 ${height}，实际为 ${metadata.height}`);
    if (alpha === true && !metadata.hasAlpha) failures.push(`${label} 必须保留 Alpha`);
    if (alpha === false && metadata.hasAlpha) failures.push(`${label} 不应包含 Alpha`);
  } catch (error) {
    failures.push(`无法读取图片 ${relative(publicRoot, path)}：${error.message}`);
  }
}

const rootEntries = readdirSync(publicRoot).sort();
const allowedRootEntries = ['app-icons', 'hero', 'images', 'manifest.webmanifest'];
for (const entry of rootEntries) {
  if (!allowedRootEntries.includes(entry)) failures.push(`public 根目录存在未归类内容：${entry}`);
}

const allPublicFiles = walk(publicRoot);
for (const path of allPublicFiles) {
  const relativePath = relative(publicRoot, path);
  const extension = extname(path).toLowerCase();
  if (relativePath === 'manifest.webmanifest') continue;
  if (relativePath.startsWith('app-icons/')) {
    if (extension !== '.png') failures.push(`PWA 图标必须为 PNG：${relativePath}`);
  } else if (extension !== '.webp') {
    failures.push(`非 PWA 图片必须为 WebP：${relativePath}`);
  }
}

await checkImage(join(publicRoot, 'app-icons/icon-192.png'), { width: 192, height: 192, format: 'png' });
await checkImage(join(publicRoot, 'app-icons/icon-512.png'), { width: 512, height: 512, format: 'png' });

const classicRoot = join(publicRoot, 'hero/classic');
const classicPeriods = ['morning', 'midday', 'afternoon', 'evening', 'night'];
for (const entry of readdirSync(classicRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    failures.push(`经典背景根目录只允许方案目录：${entry.name}`);
    continue;
  }
  const dir = join(classicRoot, entry.name);
  const names = readdirSync(dir).sort();
  const expected = classicPeriods.map((period) => `${period}.webp`).sort();
  if (names.join('|') !== expected.join('|')) failures.push(`经典背景 ${entry.name} 必须且只能包含五个时段文件`);
  for (const name of expected) await checkImage(join(dir, name));
}

const weatherRoot = join(publicRoot, 'hero/weather');
const weatherPeriods = ['morning', 'daytime', 'evening', 'night'];
const iconGroups = {
  quick: ['feeding', 'bowel', 'care', 'note'],
  tasks: ['medicine', 'massage', 'bath', 'care', 'vaccine', 'growth'],
  nav: ['today', 'records', 'chat', 'trends', 'archive'],
};

for (const entry of readdirSync(weatherRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'shared') continue;
  const theme = entry.name;
  const themeRoot = join(weatherRoot, theme);
  const expectedFiles = new Set();
  const backgroundsRoot = join(themeRoot, 'backgrounds');
  const backgroundDirs = readdirSync(backgroundsRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name);
  if (!backgroundDirs.includes('default')) failures.push(`完整主题 ${theme} 缺少 backgrounds/default`);
  for (const background of backgroundDirs) {
    const dir = join(backgroundsRoot, background);
    const names = readdirSync(dir).sort();
    const expected = weatherPeriods.map((period) => `${period}.webp`).sort();
    if (names.join('|') !== expected.join('|')) failures.push(`主题 ${theme} 的背景 ${background} 必须且只能包含四个时段文件`);
    for (const name of expected) {
      const path = join(dir, name);
      expectedFiles.add(path);
      await checkImage(path, { width: 1080, height: 432, alpha: false });
    }
    if (background !== 'default') {
      const thumbnail = join(themeRoot, `thumbnails/${background}.webp`);
      expectedFiles.add(thumbnail);
      await checkImage(thumbnail, { width: 540, height: 216, alpha: false });
    }
  }
  for (const [group, names] of Object.entries(iconGroups)) {
    for (const name of names) {
      const path = join(themeRoot, `icons/${group}/${name}.webp`);
      expectedFiles.add(path);
      await checkImage(path, { width: 256, height: 256, alpha: true });
    }
  }
  const themeThumbnail = join(themeRoot, 'thumbnails/theme.webp');
  expectedFiles.add(themeThumbnail);
  await checkImage(themeThumbnail, { width: 540, height: 216, alpha: false });
  const actualFiles = walk(themeRoot);
  for (const path of actualFiles) {
    if (!expectedFiles.has(path)) failures.push(`主题 ${theme} 存在未登记资源：${relative(themeRoot, path)}`);
  }
  for (const path of expectedFiles) requireFile(path);
}

for (const group of Object.keys(iconGroups)) {
  const dir = join(publicRoot, `images/icons/${group}`);
  for (const file of readdirSync(dir)) await checkImage(join(dir, file), { width: 256, height: 256, alpha: true });
}

const sourceFiles = [
  ...walk(join(projectRoot, 'src')).filter((path) => /\.(?:ts|tsx|css)$/.test(path)),
  join(projectRoot, 'index.html'),
];
const assetPattern = /\/(?:app-icons|hero|images)\/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg)(?:\?[A-Za-z0-9_=&.-]+)?/g;
const referencedAssets = new Set();
for (const path of sourceFiles) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(assetPattern)) referencedAssets.add(match[0].split('?')[0]);
}
const manifest = readFileSync(join(publicRoot, 'manifest.webmanifest'), 'utf8');
for (const match of manifest.matchAll(assetPattern)) referencedAssets.add(match[0].split('?')[0]);
for (const url of referencedAssets) requireFile(join(publicRoot, url.slice(1)), url);

if (failures.length) {
  console.error(`[assets:check] 失败，共 ${failures.length} 项`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[assets:check] OK ${allPublicFiles.length} 个 public 文件 · ${checkedImages.size} 张图片 · ${referencedAssets.size} 个代码引用`);
