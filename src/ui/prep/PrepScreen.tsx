import { useState } from 'react';
import type { MountainDef } from '../../data/mountains';
import { GAME_CONFIG } from '../../engine/config/game.config';
import {
  loadoutWarnings,
  packWeightKg,
  validateLoadout,
  weightPenalty,
  type Loadout,
} from '../../engine/equipment/loadout';
import { MenuScreen } from '../menu/MenuScreen';
import { adjustCount, formatKg, toggleItem } from './prepModel';

interface PrepScreenProps {
  mountain: MountainDef;
  onBack: () => void;
  onStart: (loadout: Loadout) => void;
}

/** Expedition Prep (M2b spec §5.3): pick the loadout, see weight and warnings, start. */
export function PrepScreen({ mountain, onBack, onStart }: PrepScreenProps) {
  const gear = mountain.gear;
  const [loadout, setLoadout] = useState<Loadout>(gear.defaults);
  const kg = packWeightKg(loadout);
  const freeKg = GAME_CONFIG.equipment.weight.freeKg;
  const over = weightPenalty(kg).staminaCostMul > 1;
  const errors = validateLoadout(loadout, gear);
  const warnings = loadoutWarnings(loadout, gear);

  const footer = (
    <div className="prep">
      <div className={`prep__weight${over ? ' prep__weight--over' : ''}`}>
        <span className="prep__weight-label">Pack</span>
        <div className="prep__weight-bar" aria-hidden="true">
          <div
            className="prep__weight-fill"
            style={{ width: `${Math.min(100, (kg / freeKg) * 100)}%` }}
          />
        </div>
        <span data-testid="pack-weight">{`${formatKg(kg)} / ${freeKg} kg`}</span>
      </div>
      {warnings.length > 0 && (
        <ul className="prep__warnings" data-testid="prep-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="prep__errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="overlay__action prep__start"
        disabled={errors.length > 0}
        onClick={() => onStart(loadout)}
      >
        Start climb
      </button>
    </div>
  );

  return (
    <MenuScreen
      subtitle={`${mountain.facts.name} — pack your gear`}
      back={{ label: 'Mountains', onClick: onBack }}
      footer={footer}
    >
      {gear.available.map((id) => {
        const item = GAME_CONFIG.items[id];
        const n = loadout[id] ?? 0;
        if (item.kind === 'stack') {
          return (
            <div key={id} className="card card--item" role="group" aria-label={item.name}>
              <span className="card__name">{item.name}</span>
              <span className="card__meta">{`${item.weightKg} kg each`}</span>
              <span className="card__note">{item.effect}</span>
              <div className="stepper">
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  disabled={n <= 0}
                  onClick={() => setLoadout(adjustCount(loadout, id, -1, gear))}
                >
                  −
                </button>
                <span className="stepper__count" data-testid={`count-${id}`}>
                  {n}
                </span>
                <button
                  type="button"
                  aria-label={`Add ${item.name}`}
                  disabled={n >= item.maxCount}
                  onClick={() => setLoadout(adjustCount(loadout, id, 1, gear))}
                >
                  +
                </button>
              </div>
            </div>
          );
        }
        const required = gear.required.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`card card--item${n > 0 ? ' card--packed' : ''}`}
            aria-pressed={n > 0}
            disabled={required}
            onClick={() => setLoadout(toggleItem(loadout, id, gear))}
          >
            <span className="card__name">{item.name}</span>
            <span className="card__meta">{`${item.weightKg} kg`}</span>
            <span className="card__note">{item.effect}</span>
            <span className="card__action">
              {required ? 'Required' : n > 0 ? 'Packed' : 'Left behind'}
            </span>
          </button>
        );
      })}
    </MenuScreen>
  );
}
