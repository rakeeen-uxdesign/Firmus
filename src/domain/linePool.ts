import type { DayPhase } from '@/domain/devotion/prayer';

/** What a header line is about: love, design & art, or nature. */
export type LineTheme = 'love' | 'design' | 'nature';

type PoolEntry = readonly [LineTheme, string];

const L = 'love', D = 'design', N = 'nature';

/**
 * The ambient header lines, per part of the day (the phases follow the real prayer
 * times — see `getDayPhase`). Lines end with a trailing space because the greeting
 * appends a name straight after. Add a line to any phase freely: the rotation below
 * adapts to the pool's size.
 */
export const LINE_POOL: Record<DayPhase, readonly PoolEntry[]> = {
  deepNight: [
    [N, "THE ROOSTERS HAVEN'T CLOCKED IN YET ... NEITHER SHOULD YOU "],
    [N, 'NOTHING OUTSIDE BUT CATS AND SECRETS ... '],
    [L, "WHOEVER YOU'RE THINKING OF IS ASLEEP ... TEXT THEM AT BREAKFAST "],
    [L, "LOVE CAN WAIT TILL MORNING ... IT'S PATIENT LIKE THAT "],
    [D, 'DARK MODE IS ON ... THE WHOLE SKY IS USING IT '],
    [D, "TODAY'S ARTBOARD IS STILL EMPTY ... NO RUSH "],
    [N, 'EVEN THE CRICKETS ARE ON A BREAK ... '],
    [L, 'DREAM SOMETHING NICE ABOUT SOMEONE ... '],
    [D, 'THIS HOUR HAS ZERO NOTIFICATIONS ... ENJOY IT '],
    [N, 'THE CITY IS ON AIRPLANE MODE ... '],
  ],
  fajrHour: [
    [N, 'THE SKY IS WARMING UP ITS PAINT ... '],
    [N, 'EVEN THE PIGEONS LOOK SLEEPY ... '],
    [L, 'THE DAY SAID GOOD MORNING FIRST ... BE POLITE, ANSWER '],
    [L, 'SOMEONE WILL SMILE BECAUSE OF YOU TODAY ... START EARLY '],
    [D, 'THE SKY IS DOING A FREE GRADIENT DEMO ... '],
    [D, 'SUNRISE IS JUST A VERY SLOW FADE-IN ... '],
    [N, 'THE AIR IS BRAND NEW ... NOBODY HAS USED IT YET '],
    [L, "TODAY'S AGENDA: BE NICE TO PEOPLE, EAT WELL "],
    [D, 'FRESH CANVAS, NO ERASER NEEDED YET ... '],
  ],
  morning: [
    [N, 'THE SUN CLOCKED IN EARLY ... SHOW OFF '],
    [N, 'EVEN THE PLANTS ARE FACING THE RIGHT WAY ... '],
    [L, "SAY SOMETHING NICE TO SOMEONE BEFORE NOON ... IT'S CHEAP "],
    [L, 'YOUR PEOPLE ARE ALSO FIGURING OUT THEIR COFFEE ... '],
    [D, 'KERNING IS A FORM OF LOVE ... '],
    [D, 'MOODBOARD FOR TODAY: LIGHT, COFFEE, PROGRESS '],
    [N, 'THE BREEZE IS STILL BEING POLITE ... '],
    [L, "BE THE PERSON YOU'D WANT TO MEET TODAY ... "],
    [D, "ONE CLEAN SHAPE AT A TIME ... THAT'S HOW A DAY IS DRAWN "],
    [N, 'THE LIGHT IS THE GOOD KIND ... NO FILTER NEEDED '],
  ],
  hunting: [
    [N, 'THE SUN IS ALMOST OVERHEAD ... SHADOWS ARE HIDING UNDER YOUR SHOES '],
    [N, 'THE BIRDS ARE ON THEIR LUNCH BREAK ... '],
    [D, "ALIGN TO THE GRID ... OR DON'T, ARTISTS DO WHAT THEY WANT "],
    [D, 'MAKE IT WORK, THEN MAKE IT PRETTY ... '],
    [L, 'YOUR FAVORITE PERSON WOULD SAY EAT SOMETHING ... '],
    [L, 'A SMALL KINDNESS BEFORE LUNCH ... GREAT APPETIZER '],
    [N, 'EVEN THE CLOUDS ARE TAKING IT SLOW ... '],
    [D, 'WHITE SPACE IS NOT WASTED SPACE ... NEITHER IS A COFFEE BREAK '],
    [N, "THE PLANTS ARE DOING PHOTOSYNTHESIS AND YOU'RE DOING YOUR BEST ... "],
  ],
  midday: [
    [N, 'HIGH NOON ... THE SUN IS FLEXING '],
    [N, 'A TREE SOMEWHERE IS OFFERING FREE SHADE ... '],
    [L, 'CALL SOMEONE YOU MISS ... TWO MINUTES COUNTS '],
    [L, 'LUNCH TASTES BETTER WITH COMPANY ... '],
    [D, 'EVERY SHADOW IS A TINY BLACK-AND-WHITE ARTWORK ... '],
    [D, 'MIDDAY LIGHT IS A BAD STUDIO LAMP ... STILL BEAUTIFUL '],
    [N, 'THE WIND WENT FOR A NAP ... '],
    [D, 'ART DIRECTION FOR NOW: ONE SUN, ZERO FILTERS '],
    [L, 'THE NICEST THING YOU CAN DO FOR YOURSELF IS A GLASS OF WATER ... '],
  ],
  push: [
    [N, 'THE SUN HAS STARTED ITS WALK HOME ... '],
    [N, 'SHADOWS ARE GROWING LEGS ... '],
    [D, 'THE LAST COAT OF PAINT ... THEN YOU CAN POST IT '],
    [D, "A DESIGN ISN'T DONE, IT'S JUST DUE ... ALMOST THERE "],
    [L, 'THE EVENING IS WAITING FOR YOU ... FINISH AND GO '],
    [L, 'SOMEONE SAVED YOU A SEAT FOR LATER ... '],
    [N, "THE HEAT IS GIVING UP ... DON'T TELL IT I SAID THAT "],
    [D, 'ADD ONE DETAIL NOBODY WILL NOTICE ... YOU WILL KNOW '],
    [N, "A LAZY CAT IS STILL WINNING THE DAY ... DON'T COMPARE "],
  ],
  birdsHome: [
    [N, 'THE BIRDS ARE COMMUTING ... TRAFFIC IN THE SKY '],
    [N, 'THE SKY IS IN THE MOOD FOR PEACH ... '],
    [L, 'DINNER IS A GOOD REASON TO GO HOME ... '],
    [L, "GO HOME TO SOMEONE WHO'S GLAD ABOUT IT ... "],
    [D, 'THE LIGHT JUST SWITCHED TO WARM WHITE ... '],
    [D, 'ONE HORIZON, ONE SUN, ZERO CLUTTER ... PERFECT LAYOUT '],
    [N, 'THE CLOUDS ARE GETTING THEIR OUTFITS READY ... '],
    [L, 'THE SWEETEST HOURS ARE THE ONES NOBODY SCHEDULES ... '],
    [D, 'SAVE YOUR WORK ... THE BEST LIGHT IS COMING '],
  ],
  goldenHour: [
    [N, 'THE SUN IS PUTTING ON ITS BEST FILTER ... '],
    [N, 'EVERY WALL IS A PAINTING FOR THE NEXT HOUR ... '],
    [N, 'THE SUN IS TAKING ITS BOW ... CLAP QUIETLY '],
    [L, 'EVERYONE IS TEN PERCENT MORE ADORABLE RIGHT NOW ... '],
    [L, 'LOOK UP WITH SOMEONE ... SAME SKY, BETTER COMPANY '],
    [D, 'THE BEST ARTBOARD OF THE DAY IS ABOVE YOU ... '],
    [D, 'PHOTOGRAPHERS ARE SPRINTING TO WINDOWS RIGHT NOW ... '],
    [L, 'THIS IS THE LIGHT WEDDINGS GET BOOKED FOR ... '],
    [D, 'CAPTURE IT OR JUST STARE ... BOTH ARE FINE '],
    [N, 'EVEN TRASH CANS LOOK GOOD IN THIS LIGHT ... '],
  ],
  dusk: [
    [N, 'THE SUN LEFT ... THE SKY IS THE AFTER-PARTY '],
    [N, 'THE FIRST STAR ARRIVED EARLY ... SHOW OFF '],
    [N, 'THE SKY IS CHANGING OUTFITS BEHIND A CURTAIN ... '],
    [L, 'THE DAY CLOCKED OUT ... GO EAT SOMETHING WITH PEOPLE '],
    [L, "IT'S THE HOUR FOR LONG HUGS AND SHORT TEXTS ... "],
    [D, 'PINK, ORANGE, PURPLE ... NOBODY ASKED IT TO COORDINATE '],
    [D, 'A GRADIENT WITH NO EXPORT BUTTON ... LOOK AT IT NOW '],
    [L, 'TELL SOMEONE THEY WERE ON YOUR MIND ... '],
    [D, 'THE STREETLIGHTS ARE CLICKING ON ... LITTLE PIXELS OF EVENING '],
    [N, 'THE BATS ARE STARTING THEIR SHIFT ... '],
  ],
  ishaNear: [
    [N, 'THE AIR GOT COOL AND COZY ... '],
    [N, 'THE GOOD KIND OF QUIET IS ARRIVING ... '],
    [L, 'NIGHT IS A GOOD TIME TO SAY THANK YOU ... '],
    [L, 'GOODNIGHT TEXTS ARE UNDERRATED ... '],
    [D, 'THE PALETTE HAS SHRUNK TO INK AND GLOW ... '],
    [D, 'LET THE SHADOWS DO THE SHADING ... '],
    [N, 'THE CRICKETS ARE WARMING UP THE NIGHT SHOW ... '],
    [L, 'WRAP THE DAY UP WITH SOMETHING WARM ... '],
    [D, 'SAVE, EXPORT, CLOSE THE LAPTOP ... '],
  ],
  night: [
    [N, 'THE MOON IS POSTING ITS OWN STORY ... NO CAPTION '],
    [N, 'THE NIGHT AIR HAS A SOFT VOICE ... '],
    [L, 'WHOEVER LOVES YOU IS ALREADY PROUD OF YOUR DAY ... '],
    [L, 'GO TO BED ... TOMORROW HAS A SOFT OPENING '],
    [D, 'DARK MODE FOR THE WHOLE WORLD ... NO TOGGLE NEEDED '],
    [D, 'EVERY STAR IS A PIXEL NOBODY HAD TO DRAW ... '],
    [N, 'THE NIGHT SHIFT BELONGS TO THE CRICKETS ... '],
    [L, 'DREAM OF SOMETHING THAT MAKES YOU GRIN ... '],
    [D, 'AUTOSAVE IS ON ... YOU CAN REST NOW '],
  ],
};

/** Days since 1970 for the local calendar date of `now` — steps by exactly 1 each day, DST-proof. */
function dayNumber(now: Date): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/** Small seeded PRNG (mulberry32) — same seed, same sequence, on every device. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The pool's indices in this cycle's order — a different shuffle each cycle, per phase. */
function cycleOrder(phase: DayPhase, size: number, cycle: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  const rand = seededRandom(hashString(phase) + Math.imul(cycle + 1, 2654435761));
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Today's ambient line for this part of the day. Each day takes the next line of the
 * phase's pool, so nothing repeats until every line has been used; then the pool is
 * reshuffled into a new order (and the first line never repeats the last one just shown).
 * Pure function of the date — no storage, and every device shows the same line.
 */
export function pickPoolLine(phase: DayPhase, now: Date = new Date()): string {
  const pool = LINE_POOL[phase];
  const day = dayNumber(now);
  const cycle = Math.floor(day / pool.length);
  const position = day % pool.length;

  const order = cycleOrder(phase, pool.length, cycle);
  // Applied to the whole cycle (not just its first day), so the order stays one consistent permutation.
  if (cycle > 0 && pool.length > 1) {
    const previousLast = cycleOrder(phase, pool.length, cycle - 1)[pool.length - 1];
    if (order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  }
  return pool[order[position]][1];
}

/** Short blessings shown next to the achievement vectors — rotated by day, like the pool. */
const BLESSINGS = ['MASHALLAH ', 'ALHAMDULILLAH ', 'BARAKALLAH FIK '] as const;
export function pickBlessing(now: Date = new Date()): string {
  return BLESSINGS[((dayNumber(now) % BLESSINGS.length) + BLESSINGS.length) % BLESSINGS.length];
}
