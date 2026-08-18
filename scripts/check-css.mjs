import { readFileSync, readdirSync } from 'node:fs';

const files = ['src/ui.css', ...readdirSync(new URL('../src/styles/', import.meta.url)).map(name => `src/styles/${name}`)];
let failed = false;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
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

if (failed) process.exit(1);
console.log(`[check:css] OK ${files.join(', ')}`);
