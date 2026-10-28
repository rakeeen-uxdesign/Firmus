import { card, row, ButtonStyle } from '../lib/ui.js';

export function buildHubView() {
  return {
    embeds: [card({
      domain: 'system',
      headline: 'Tap a card to control it from here.',
      big: 'Firmus Control',
      note: 'Firmus · auto-closes in 1m',
    })],
    components: [row([
      { id: 'bommy:water', label: 'Water', style: ButtonStyle.Primary },
      { id: 'bommy:focus', label: 'Focus', style: ButtonStyle.Primary },
      { id: 'bommy:finance', label: 'Finance', style: ButtonStyle.Primary },
    ])],
  };
}
