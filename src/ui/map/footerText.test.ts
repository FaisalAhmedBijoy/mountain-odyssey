import { describe, expect, it } from 'vitest';
import { mapFooterText } from './footerText';

const fmt = (m: number) => `${m} m`;
const camps = [
  { id: 'a', name: 'Khare' },
  { id: 'b', name: 'Summit' },
];

describe('mapFooterText', () => {
  it('uses the guide when present', () => {
    expect(
      mapFooterText(
        { label: 'High Camp', distanceM: 120 },
        camps,
        { a: 'reached', b: 'next' },
        fmt,
      ),
    ).toBe('Next: High Camp · 120 m');
  });
  it('names the next camp when there is no guide', () => {
    expect(mapFooterText(null, camps, { a: 'reached', b: 'next' }, fmt)).toBe('Next: Summit');
  });
  it('says all camps reached only when every camp is reached', () => {
    expect(mapFooterText(null, camps, { a: 'reached', b: 'reached' }, fmt)).toBe(
      'All camps reached',
    );
  });
  it('is empty otherwise', () => {
    expect(mapFooterText(null, camps, {}, fmt)).toBe('');
  });
});
