import { getDashboardValue, setDashboardValue } from '../lib/firestore.js';
import { isWaterLocked } from '../lib/prayerTimes.js';
import { isFriday } from '../lib/day.js';
import { card, row, ButtonStyle } from '../lib/ui.js';
import { NAME_MARKED } from '../lib/brand.js';

const GOAL = 12;
const GLASS_KEY = 'hydration_glasses';
const FRIDAY_KEY = 'friday_opt_in';

async function readState() {
  const [glasses, optIns, locked] = await Promise.all([
    getDashboardValue(GLASS_KEY, 0),
    getDashboardValue(FRIDAY_KEY, {}),
    isWaterLocked(),
  ]);
  const now = new Date();
  const dateKey = now.toDateString();
  const friday = isFriday(now);
  const fridayLocked = friday && !optIns[dateKey];
  return { glasses, fridayLocked, locked };
}

/** Renders the Water card as {embeds, components} — used for both the first reply and every button update. */
export async function buildWaterView() {
  const { glasses, fridayLocked, locked } = await readState();

  if (fridayLocked) {
    return {
      embeds: [card({
        domain: 'water',
        headline: "It's Jumu'ah — Friday is opt-in system-wide.",
        big: `${glasses} / ${GOAL}`,
        note: `${NAME_MARKED} · Water · nothing logged counts until you opt in`,
      })],
      components: [row([
        { id: 'water:fridayoptin', label: 'Count Today Anyway', style: ButtonStyle.Success },
        { id: 'bommy:home', label: 'Main Menu' },
      ])],
    };
  }

  return {
    embeds: [card({
      domain: 'water',
      headline: locked ? 'Logging reopens at Fajr.' : 'Glasses today',
      big: `${glasses} / ${GOAL}`,
    })],
    components: [row([
      { id: 'water:add', label: 'Add Glass', style: ButtonStyle.Success, disabled: locked },
      { id: 'water:undo', label: 'Undo', disabled: locked || glasses <= 0 },
      { id: 'bommy:home', label: 'Main Menu' },
    ])],
  };
}

export async function addGlass() {
  const { glasses, locked, fridayLocked } = await readState();
  if (!locked && !fridayLocked) await setDashboardValue(GLASS_KEY, glasses + 1);
}

export async function undoGlass() {
  const { glasses, locked, fridayLocked } = await readState();
  if (!locked && !fridayLocked && glasses > 0) await setDashboardValue(GLASS_KEY, glasses - 1);
}

export async function optInFriday() {
  const optIns = await getDashboardValue(FRIDAY_KEY, {});
  const dateKey = new Date().toDateString();
  await setDashboardValue(FRIDAY_KEY, { ...optIns, [dateKey]: true });
}
