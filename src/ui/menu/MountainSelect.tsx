import { formatElevation, isPlayable, peaksIn, type Country } from '../../data/catalog';
import { MenuScreen } from './MenuScreen';

interface MountainSelectProps {
  country: Country;
  onClimb: (mountainId: string) => void;
  onBack: () => void;
}

export function MountainSelect({ country, onClimb, onBack }: MountainSelectProps) {
  return (
    <MenuScreen
      subtitle={`${country.name} — choose a mountain`}
      back={{ label: 'Countries', onClick: onBack }}
    >
      {peaksIn(country.code).map((peak) => {
        const playable = isPlayable(peak);
        return (
          <button
            key={peak.id}
            type="button"
            className={`card${playable ? '' : ' card--soon'}`}
            disabled={!playable}
            aria-disabled={!playable}
            onClick={() => {
              if (peak.mountainId) onClimb(peak.mountainId);
            }}
          >
            <span className="card__name">{peak.name}</span>
            <span className="card__meta">{formatElevation(peak)}</span>
            {peak.note && <span className="card__note">{peak.note}</span>}
            <span className="card__action">{playable ? 'Climb' : 'Coming soon'}</span>
          </button>
        );
      })}
    </MenuScreen>
  );
}
