// Guards the two failures that blank a Pages site: wrong base path and a missing .nojekyll.
// Run after `vite build`; exits non-zero on any problem so CI fails before deploy.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BASE } from '../vite.config.js';

const DIST = 'dist';
const problems = [];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

if (!existsSync(join(DIST, 'index.html'))) problems.push('dist/index.html missing');
if (!existsSync(join(DIST, '.nojekyll'))) problems.push('dist/.nojekyll missing (Jekyll would drop _-prefixed files)');

const files = existsSync(DIST) ? walk(DIST) : [];
const textFiles = files.filter((f) => /\.(html|css|js)$/.test(f));

// Every root-absolute reference must carry the base and resolve to a real file in dist.
const refPattern = /(?:src|href)=["'](\/[^"']*)["']|url\(\s*["']?(\/[^"')]+)["']?\s*\)/g;
let checked = 0;
for (const file of textFiles) {
  const body = readFileSync(file, 'utf8');
  for (const match of body.matchAll(refPattern)) {
    const ref = (match[1] ?? match[2]).split(/[?#]/)[0];
    if (ref.startsWith('//')) continue; // protocol-relative external
    checked++;
    if (!ref.startsWith(BASE)) {
      problems.push(`${relative(DIST, file)}: "${ref}" is root-absolute without base ${BASE}`);
    } else if (!existsSync(join(DIST, ref.slice(BASE.length)))) {
      problems.push(`${relative(DIST, file)}: "${ref}" does not exist in dist`);
    }
  }
  if (/["'`]\/assets\//.test(body)) problems.push(`${relative(DIST, file)}: bare "/assets/" path found`);

  // Demo contract (CLAUDE.md §3): the site never offers a place to type a password or corpus.
  // Non-text controls (range, checkbox, radio, button) are fine; anything that accepts text is not.
  const textEntry = [
    ...body.matchAll(/<input\b(?![^>]*type=["']?(range|checkbox|radio|button|submit|reset)\b)[^>]*>/gi),
    ...body.matchAll(/<textarea\b|contenteditable|createElement\(\s*["'](input|textarea)["']/gi),
  ];
  for (const m of textEntry) problems.push(`${relative(DIST, file)}: text-entry control found (${m[0].slice(0, 40)}) — violates the demo contract`);
}

if (problems.length) {
  console.error(`check-dist: FAIL (${problems.length})\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`check-dist: OK — ${files.length} files, ${checked} base-prefixed refs resolved, .nojekyll present, base ${BASE}`);
