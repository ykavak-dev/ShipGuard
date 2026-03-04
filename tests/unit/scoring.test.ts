import { describe, it, expect } from 'vitest';
import { calculateScore } from '../../src/core/scoring';

describe('calculateScore', () => {
  it('returns 100 for zero findings', () => {
    expect(calculateScore({ critical: 0, medium: 0, low: 0 })).toBe(100);
  });

  it('deducts 15 per critical finding', () => {
    expect(calculateScore({ critical: 1, medium: 0, low: 0 })).toBe(85);
    expect(calculateScore({ critical: 2, medium: 0, low: 0 })).toBe(70);
  });

  it('deducts 6 per medium finding', () => {
    expect(calculateScore({ critical: 0, medium: 1, low: 0 })).toBe(94);
    expect(calculateScore({ critical: 0, medium: 3, low: 0 })).toBe(82);
  });

  it('deducts 2 per low finding', () => {
    expect(calculateScore({ critical: 0, medium: 0, low: 1 })).toBe(98);
    expect(calculateScore({ critical: 0, medium: 0, low: 5 })).toBe(90);
  });

  it('handles compound deductions correctly', () => {
    expect(calculateScore({ critical: 1, medium: 2, low: 3 })).toBe(67);
  });

  it('clamps at minimum 0', () => {
    expect(calculateScore({ critical: 7, medium: 0, low: 0 })).toBe(0);
    expect(calculateScore({ critical: 100, medium: 100, low: 100 })).toBe(0);
  });
});
