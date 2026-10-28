import { card, row, ButtonStyle } from '../lib/ui.js';
import { NAME_MARKED } from '../lib/brand.js';

export function buildHubView() {
  return {
    embeds: [card({
      domain: 'system',
      headline: 'Tap a card to control it from here.',
      big: `${NAME_MARKED} Control`,
      note: `${NAME_MARKED} · auto-closes in 1m`,
    })],
    components: [row([
      { id: 'bommy:water', label: 'Water', style: ButtonStyle.Primary },
      { id: 'bommy:focus', label: 'Focus', style: ButtonStyle.Primary },
      { id: 'bommy:finance', label: 'Finance', style: ButtonStyle.Primary },
    ])],
  };
}
