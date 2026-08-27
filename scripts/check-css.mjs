import { readFileSync, readdirSync } from 'node:fs';

const styleEntries = readdirSync(new URL('../src/styles/', import.meta.url), { withFileTypes: true });
const files = [
  'src/ui.css',
  ...styleEntries
    .filter(entry => entry.isFile() && entry.name.endsWith('.css'))
    .map(entry => `src/styles/${entry.name}`),
];
let failed = false;
const sources = new Map();

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  sources.set(file, source);
  const stack = [];
  let quote = '';
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (comment) {
      if (current === '*' && next === '/') { comment = false; index += 1; }
      continue;
    }
    if (!quote && current === '/' && next === '*') { comment = true; index += 1; continue; }
    if (quote) {
      if (current === '\\') index += 1;
      else if (current === quote) quote = '';
      continue;
    }
    if (current === '"' || current === "'") { quote = current; continue; }
    if (current === '{') stack.push(index);
    if (current === '}' && stack.pop() === undefined) { console.error(`${file}: unexpected } at ${index}`); failed = true; }
  }
  if (comment || quote || stack.length) {
    console.error(`${file}: unclosed ${comment ? 'comment' : quote ? 'string' : 'block'}`);
    failed = true;
  }
}

const combined = [...sources.values()]
  .map(source => source.replace(/\/\*[\s\S]*?\*\//g, ''))
  .join('\n');
const definitions = new Set([...combined.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
const usages = new Set([...combined.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]));
const undefinedVariables = [...usages]
  .filter(name => !definitions.has(name) && !name.startsWith('--overview-'))
  .sort();
if (undefinedVariables.length) {
  console.error(`[check:css] undefined custom properties: ${undefinedVariables.join(', ')}`);
  failed = true;
}

const importantCount = (combined.match(/!important/g) || []).length;
const importantBudget = 40;
if (importantCount > importantBudget) {
  console.error(`[check:css] !important count ${importantCount} exceeds the migration budget ${importantBudget}`);
  failed = true;
}

const rawHighLayers = [...combined.matchAll(/z-index:\s*(\d+)/g)]
  .map(match => Number(match[1]))
  .filter(value => value >= 20).length;

const completeThemes = ['travel', 'orbit', 'shop', 'arcane', 'ocean', 'forest-press'];
const requiredThemeAnchors = ['page', 'card', 'brand', 'ink', 'muted', 'complement'];
const protectedThemeTokens = ['--token-today-plan-title', '--token-surface-plan'];
for (const theme of completeThemes) {
  const file = `src/styles/theme-${theme}.css`;
  const source = sources.get(file) ?? '';
  for (const mode of ['light', 'dark']) {
    const escapedTheme = theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockPattern = new RegExp(`html\\[data-visual-theme="${escapedTheme}"\\]\\[data-theme="${mode}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`);
    const block = source.match(blockPattern)?.[1] ?? '';
    const anchors = new Set([...block.matchAll(/--theme-([\w-]+)\s*:/g)].map(match => match[1]));
    const missing = requiredThemeAnchors.filter(anchor => !anchors.has(anchor));
    const extra = [...anchors].filter(anchor => !requiredThemeAnchors.includes(anchor));
    if (missing.length || extra.length || anchors.size !== requiredThemeAnchors.length) {
      console.error(`[check:css] ${theme}/${mode} theme anchors invalid · missing: ${missing.join(', ') || '-'} · extra: ${extra.join(', ') || '-'}`);
      failed = true;
    }
  }
  for (const token of protectedThemeTokens) {
    if (source.includes(`${token}:`)) {
      console.error(`[check:css] ${file} overrides protected token ${token}`);
      failed = true;
    }
  }
  if (/--token-[\w-]+\s*:/.test(source)) {
    console.error(`[check:css] ${file} must declare six --theme-* anchors instead of component tokens`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`[check:css] OK ${files.length} files · ${definitions.size} tokens · ${importantCount}/${importantBudget} !important · ${rawHighLayers} legacy high layers`);
