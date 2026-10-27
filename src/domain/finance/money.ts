/** Rounds and formats an amount as Egyptian pounds: 1234.5 → "1,235 EGP". */
export function formatEGP(n: number): string {
  return `${Math.round(n).toLocaleString('en-EG')} EGP`;
}

/** The same with its sign always shown: 1200 → "+1,200 EGP", −300 → "−300 EGP" (a real minus, not a hyphen). */
export function formatSignedEGP(n: number): string {
  return `${n >= 0 ? '+' : '−'}${formatEGP(Math.abs(n))}`;
}

/** A percentage to one decimal with its sign: 7.34 → "+7.3%", −0.5 → "−0.5%". */
export function formatSignedPercent(percent: number): string {
  return `${percent >= 0 ? '+' : '−'}${Math.abs(percent).toFixed(1)}%`;
}
