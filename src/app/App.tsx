import { useState } from 'react';
import { getCountry, type CountryCode } from '../data/catalog';
import { getMountain, type MountainDef } from '../data/mountains';
import { CountrySelect } from '../ui/menu/CountrySelect';
import { MountainSelect } from '../ui/menu/MountainSelect';
import { GameView } from './GameView';
import { isDesktop, supportsWebGL2 } from './webgl';

type Screen =
  | { screen: 'countries' }
  | { screen: 'mountains'; country: CountryCode }
  /** `country` is null when the game was opened with a `?mountain=` deep link. */
  | { screen: 'game'; mountain: MountainDef; country: CountryCode | null }
  | { screen: 'unknown'; id: string };

function Unsupported({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="overlay overlay--error" role="alert">
      <p>{message}</p>
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function initialScreen(): Screen {
  const id = new URLSearchParams(window.location.search).get('mountain');
  if (id === null) return { screen: 'countries' };
  const mountain = getMountain(id);
  return mountain ? { screen: 'game', mountain, country: null } : { screen: 'unknown', id };
}

function Screens() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  switch (screen.screen) {
    case 'countries':
      return <CountrySelect onSelect={(country) => setScreen({ screen: 'mountains', country })} />;
    case 'mountains':
      return (
        <MountainSelect
          country={getCountry(screen.country)}
          onBack={() => setScreen({ screen: 'countries' })}
          onClimb={(id) => {
            const mountain = getMountain(id);
            if (mountain) setScreen({ screen: 'game', mountain, country: screen.country });
          }}
        />
      );
    case 'game':
      return (
        <GameView
          mountain={screen.mountain}
          onExit={() => {
            // Drop a deep link so a reload opens the menus, not the same mountain.
            window.history.replaceState(null, '', window.location.pathname);
            setScreen(
              screen.country
                ? { screen: 'mountains', country: screen.country }
                : { screen: 'countries' },
            );
          }}
        />
      );
    case 'unknown':
      return (
        <Unsupported
          message={`Unknown mountain "${screen.id}".`}
          action={{
            label: 'Choose a mountain',
            onClick: () => {
              window.history.replaceState(null, '', window.location.pathname);
              setScreen({ screen: 'countries' });
            },
          }}
        />
      );
  }
}

export function App() {
  if (!isDesktop()) {
    return (
      <Unsupported message="Mountain Odyssey is a desktop game. Please open it on a computer with a keyboard and mouse." />
    );
  }
  if (!supportsWebGL2()) {
    return (
      <Unsupported message="Mountain Odyssey needs WebGL2. Please use the latest Chrome, Edge, Firefox or Safari." />
    );
  }
  return <Screens />;
}
