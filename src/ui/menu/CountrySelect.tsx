import { COUNTRIES, peaksIn, type CountryCode } from '../../data/catalog';
import { MenuScreen } from './MenuScreen';

export function CountrySelect({ onSelect }: { onSelect: (code: CountryCode) => void }) {
  return (
    <MenuScreen subtitle="Choose a country">
      {COUNTRIES.map((country) => {
        const count = peaksIn(country.code).length;
        return (
          <button
            key={country.code}
            type="button"
            className="card"
            onClick={() => onSelect(country.code)}
          >
            <span className="card__flag" aria-hidden="true">
              {country.flag}
            </span>
            <span className="card__name">{country.name}</span>
            <span className="card__meta">
              {count} {count === 1 ? 'peak' : 'peaks'}
            </span>
          </button>
        );
      })}
    </MenuScreen>
  );
}
