import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const assetsDirectory = resolve('dist/assets');
const cssFiles = readdirSync(assetsDirectory).filter(file => file.endsWith('.css'));
const css = cssFiles.map(file => readFileSync(join(assetsDirectory, file), 'utf8')).join('\n');
const modalBlocks = [...css.matchAll(/\.modal-layer\{([^}]*)\}/g)].map(match => match[1]);
const hasStandardFilter = modalBlocks.some(block => /(^|[;}])backdrop-filter:/.test(block));
const hasWebkitFallback = modalBlocks.some(block => /-webkit-backdrop-filter:/.test(block));

if (!hasStandardFilter || !hasWebkitFallback) {
  console.error(`[check:built-css] modal backdrop filters missing: standard=${hasStandardFilter} webkit=${hasWebkitFallback}`);
  process.exit(1);
}

console.log(`[check:built-css] OK ${cssFiles.length} CSS files · standard and WebKit modal filters retained`);
