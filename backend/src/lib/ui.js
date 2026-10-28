import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

/**
 * Firmus's Discord "design system" — the smart-home-panel look every card in
 * this bot shares. One function builds the embed shell (`card`), one builds a
 * row of buttons (`row`). Everything else in discord/ composes these two.
 *
 * Colors are the same CSS variables the web app uses in dark mode
 * (src/styles/global.css), so a card here reads as the same product, not a
 * reskin — kept in sync by hand since the two codebases don't share a build.
 */
const BRAND = {
  water:   { color: 0x5EC8B0, label: 'Water' },
  focus:   { color: 0xD7EA6C, label: 'Focus' },
  finance: { color: 0xE8C04A, label: 'Finance' },
  system:  { color: 0xC2DC3F, label: 'Firmus' },
};

/**
 * @param {object} opts
 * @param {keyof typeof BRAND} opts.domain
 * @param {string} [opts.headline] - small line above the big number
 * @param {string} [opts.big] - the one number/state this card exists to show
 * @param {[string, string, boolean?][]} [opts.rows] - [name, value, inline]
 * @param {string} [opts.note] - footer text, defaults to a brand signature
 */
export function card({ domain, headline, big, rows = [], note }) {
  const b = BRAND[domain] ?? BRAND.system;
  const embed = new EmbedBuilder()
    .setColor(b.color)
    .setAuthor({ name: b.label.toUpperCase() })
    .setFooter({ text: note ?? `Firmus · ${b.label} · auto-closes in 1m` })
    .setTimestamp();

  const description = [big ? `## ${big}` : null, headline ?? null].filter(Boolean).join('\n');
  if (description) embed.setDescription(description);
  if (rows.length) {
    embed.addFields(rows.map(([name, value, inline = true]) => ({ name, value, inline })));
  }
  return embed;
}

/** @param {{id: string, label: string, style?: ButtonStyle, emoji?: string, disabled?: boolean}[]} buttons */
export function row(buttons) {
  return new ActionRowBuilder().addComponents(
    buttons.map((b) => {
      const btn = new ButtonBuilder()
        .setCustomId(b.id)
        .setLabel(b.label)
        .setStyle(b.style ?? ButtonStyle.Secondary)
        .setDisabled(!!b.disabled);
      if (b.emoji) btn.setEmoji(b.emoji);
      return btn;
    })
  );
}

export { ButtonStyle };
