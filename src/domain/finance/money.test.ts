import { describe, it, expect } from 'vitest';
import { formatEGP, formatSignedEGP, formatSignedPercent } from '@/domain/finance/money';

describe('formatEGP', () => {
  it('rounds to whole pounds with thousands separators', () => {
    expect(formatEGP(1234.5)).toBe('1,235 EGP');
    expect(formatEGP(0)).toBe('0 EGP');
  });
});

describe('formatSignedEGP', () => {
  it('always shows the sign, using a real minus', () => {
    expect(formatSignedEGP(1200)).toBe('+1,200 EGP');
    expect(formatSignedEGP(-300)).toBe('−300 EGP');
  });
  it('zero counts as a gain, not a loss', () => {
    expect(formatSignedEGP(0)).toBe('+0 EGP');
  });
});

describe('formatSignedPercent', () => {
  it('one decimal, with its sign', () => {
    expect(formatSignedPercent(7.34)).toBe('+7.3%');
    expect(formatSignedPercent(-0.5)).toBe('−0.5%');
  });
});
