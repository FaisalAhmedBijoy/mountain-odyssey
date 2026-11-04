import { describe, expect, it } from 'vitest';
import { formatDistance } from './formatDistance';

describe('formatDistance', () => {
  it('uses metres below 1 km and kilometres with one decimal above', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(849.6)).toBe('850 m');
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(3449)).toBe('3.4 km');
  });
});
