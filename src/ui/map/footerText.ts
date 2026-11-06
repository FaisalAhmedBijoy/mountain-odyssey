export function mapFooterText(
  guide: { label: string; distanceM: number } | null,
  camps: readonly { id: string; name: string }[],
  states: Readonly<Record<string, 'reached' | 'next' | 'ahead'>>,
  formatDistance: (m: number) => string,
): string {
  if (guide) return `Next: ${guide.label} · ${formatDistance(guide.distanceM)}`;
  const next = camps.find((c) => states[c.id] === 'next');
  if (next) return `Next: ${next.name}`;
  if (camps.length > 0 && camps.every((c) => states[c.id] === 'reached'))
    return 'All camps reached';
  return '';
}
