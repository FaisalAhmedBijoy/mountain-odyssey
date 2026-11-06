import { describe, expect, it } from 'vitest';
import { formatMinSec } from './formatMinSec';

describe('formatMinSec', () => {
  it('formats whole seconds as m:ss', () => {
    expect(formatMinSec(600)).toBe('10:00');
    expect(formatMinSec(462)).toBe('7:42');
    expect(formatMinSec(5)).toBe('0:05');
    expect(formatMinSec(0)).toBe('0:00');
  });
});
