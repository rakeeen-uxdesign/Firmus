import { collectRaw } from './collect.js';
import { buildReport, egp, duration } from './data.js';
import { renderReportPdf } from './render.js';
import { card } from '../../lib/ui.js';

/**
 * Builds today's report and posts it to Discord: a short summary card, with the full report
 * attached as a PDF. Runs from a cron in bot.js; also callable on its own for a one-off send.
 *
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 */
export async function sendDailyReport(client, channelId) {
  const now = new Date();
  const report = buildReport(await collectRaw(), now);
  const pdf = await renderReportPdf(report);

  const { water, focus, finance } = report;
  const embed = card({
    domain: 'system',
    big: `Daily report · ${report.date.label}`,
    headline: report.highlights.slice(0, 3).map((h) => `• ${h.text}`).join('\n'),
    rows: [
      ['Water', `${water.glasses} / ${water.goal}`],
      ['Focus', duration(focus.minutes)],
      ["Hamed's share", egp(finance.share.amount)],
      ['In banks', egp(finance.banksTotal)],
      ['Future fund', egp(finance.future.total)],
      ['Thndr', finance.thndr ? egp(finance.thndr.value) : '—'],
    ],
    note: `Rakeeen · Daily report · ${report.date.time} Cairo · full report attached`,
  });

  const channel = await client.channels.fetch(channelId);
  await channel.send({ embeds: [embed], files: [{ attachment: pdf, name: `rakeeen-report-${report.date.iso}.pdf` }] });
  console.log(`[${report.date.time}] 📄 Daily report sent (${(pdf.length / 1024).toFixed(0)} KB)`);
}
