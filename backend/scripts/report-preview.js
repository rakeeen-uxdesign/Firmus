// Renders today's report to a local PDF — nothing is sent to Discord.
//   node scripts/report-preview.js [output.pdf]   (default: the system temp folder)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectRaw } from '../src/features/report/collect.js';
import { buildReport } from '../src/features/report/data.js';
import { renderReportPdf } from '../src/features/report/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(os.tmpdir(), 'rakeeen-report-preview.pdf');

let goldPrices = null;
try { goldPrices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gold_cache.json'), 'utf8')); } catch { /* no cached prices: gold counts as 0 */ }

const report = buildReport(await collectRaw(), new Date(), goldPrices);
fs.writeFileSync(out, await renderReportPdf(report));
console.log(`Wrote ${out}`);
console.log(report.highlights.map((h) => `  [${h.tone}] ${h.text}`).join('\n'));
process.exit(0);
