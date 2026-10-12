// Compares the shots of two builds pixel by pixel with zero tolerance
// (FTR.NAB.CMN-0005 qa, decisions 2–3) and writes a report of pairs "was / now".
//   node e2e/compare.mjs <before dir> <after dir> <report dir> [--report-only]
// Exit code 1 when a shot differs or is missing; --report-only always exits 0:
// then a person accepts the report against the list of expected changes.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [before, after, report] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reportOnly = process.argv.includes("--report-only");
if (!before || !after || !report) {
  console.error("usage: node e2e/compare.mjs <before dir> <after dir> <report dir> [--report-only]");
  process.exit(2);
}
fs.mkdirSync(report, { recursive: true });
const shots = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".png")).toSorted();
const names = [...new Set([...shots(before), ...shots(after)])].toSorted();
const rows = [];
let same = 0;
for (const f of names) {
  const a = path.join(before, f);
  const b = path.join(after, f);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { rows.push({ f, note: fs.existsSync(a) ? "нет снимка «стало»" : "нет снимка «было»" }); continue; }
  const A = PNG.sync.read(fs.readFileSync(a));
  const B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) { rows.push({ f, note: `размер ${A.width}×${A.height} → ${B.width}×${B.height}`, pair: true }); continue; }
  const out = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, out.data, A.width, A.height, { threshold: 0 });
  if (n === 0) { same++; continue; }
  fs.writeFileSync(path.join(report, `diff-${f}`), PNG.sync.write(out));
  rows.push({ f, note: `отличается ${n} px`, pair: true, diff: true });
}
for (const r of rows.filter((x) => x.pair)) {
  fs.copyFileSync(path.join(before, r.f), path.join(report, `before-${r.f}`));
  fs.copyFileSync(path.join(after, r.f), path.join(report, `after-${r.f}`));
}
const img = (src) => `<a href="${src}"><img src="${src}" loading="lazy"></a>`;
fs.writeFileSync(path.join(report, "index.html"), `<!doctype html><meta charset="utf-8"><title>Сравнение экранов</title>
<style>body{font:14px system-ui;margin:24px;background:#f4f4f7;color:#1b1830}h2{font-size:15px;margin:28px 0 8px}
.p{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.p img{width:100%;border:1px solid #c9c5d8;background:#fff}small{color:#55506e}</style>
<h1>Сравнение экранов</h1><p>Всего ${names.length}, совпало ${same}, отличается ${rows.length}.</p>
${rows.map((r) => `<h2>${r.f} <small>— ${r.note}</small></h2>${r.pair ? `<div class="p">${img(`before-${r.f}`)}${img(`after-${r.f}`)}${r.diff ? img(`diff-${r.f}`) : ""}</div><small>было · стало · разница</small>` : ""}`).join("\n")}
`);
console.log(`Всего ${names.length}, совпало ${same}, отличается ${rows.length}.`);
for (const r of rows) console.log(`  ${r.f}: ${r.note}`);
process.exit(rows.length && !reportOnly ? 1 : 0);
