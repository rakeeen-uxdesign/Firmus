// Renders today's report to a local PDF — nothing is sent to Discord.
//   node scripts/report-preview.js [output.pdf]   (default: the system temp folder)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectRaw } from '../src/features/report/collect.js';
import { buildReport } from '../src/features/report/data.js';
import { renderReportPdf } from '../src/features/report/render.js';

const output = process.argv[2] || path.join(os.tmpdir(), 'firmus-report-preview.pdf');

const report = buildReport(await collectRaw(), new Date());
fs.writeFileSync(output, await renderReportPdf(report));

console.log(`Wrote ${output}`);
console.log(report.highlights.map((h) => `  [${h.tone}] ${h.text}`).join('\n'));
process.exit(0);
