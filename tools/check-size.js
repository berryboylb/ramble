// Checks the gzip size of every file in dist against budgets.json. Exits with code 1 on a failure.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = path.resolve('dist');
const { rules } = JSON.parse(readFileSync('budgets.json', 'utf8'));
const patterns = rules.map((rule) => ({ ...rule, match: rule.match.map((m) => new RegExp(m)) }));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;
const groups = new Map(patterns.map((rule) => [rule, []]));
const failures = [];

for (const full of walk(dist)) {
  const file = path.relative(dist, full).split(path.sep).join('/');
  const rule = patterns.find((r) => r.match.some((m) => m.test(file)));
  if (!rule) {
    failures.push(`${file}: no budget rule matches this file.`);
    continue;
  }
  if (rule.ignore) continue;
  groups.get(rule).push({ file, gzip: gzipSync(readFileSync(full), { level: 9 }).length });
}

for (const [rule, files] of groups) {
  if (rule.ignore || files.length === 0) continue;
  console.log(`\n${rule.name}`);
  for (const { file, gzip } of files) {
    const over = rule.each && gzip > rule.each;
    console.log(`  ${over ? 'FAIL' : 'ok  '} ${kb(gzip).padStart(10)}  ${file}`);
    if (over) failures.push(`${file}: ${kb(gzip)} is over the ${kb(rule.each)} budget.`);
  }
  if (rule.total) {
    const total = files.reduce((sum, f) => sum + f.gzip, 0);
    const over = total > rule.total;
    console.log(
      `  ${over ? 'FAIL' : 'ok  '} ${kb(total).padStart(10)}  total (budget ${kb(rule.total)})`,
    );
    if (over) failures.push(`${rule.name}: ${kb(total)} is over the ${kb(rule.total)} budget.`);
  }
}

if (failures.length > 0) {
  console.error(`\nSize check failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nSize check passed.');
