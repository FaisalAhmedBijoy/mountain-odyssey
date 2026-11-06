# Country and Mountain Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the game opens, the player picks a country (Nepal, India, Bangladesh), then a mountain in it, then climbs. The pause overlay can return to the mountain list.

**Architecture:**
- A pure data catalog (`src/data/catalog.ts`) lists countries and peaks. It links playable peaks to existing `MountainDef`s.
- React menu components (`src/ui/menu/`) render cards from the catalog.
- `App` keeps a small screen state (`countries → mountains → game`) and still honours `?mountain=<id>` deep links.
- `GameView` passes an `onExit` callback to `Hud`, which shows a **Choose another mountain** button on the pause overlay.
- The engine does not change.

**Tech Stack:** React 19, TypeScript 5.9, Vitest (pure `.ts` tests only, Node environment), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-country-mountain-select-design.md`.

## Global Constraints

- Work on branch `country-select`, created from `main`.
- `src/engine/**` is not touched. React never touches Three.js or Rapier objects.
- Unit tests are `src/**/*.test.ts` in a Node environment, with no DOM. React components are verified by `typecheck`, `lint`, `build` and Playwright e2e.
- Show the DEM attribution verbatim on the menu screens: `Contains modified Copernicus DEM data`.
- `?mountain=<id>` deep links still load a mountain directly, and an unknown id still shows `Unknown mountain "<id>".`. The existing `e2e/smoke.spec.ts` must pass unchanged.
- Run `npm run format` before every commit. CI runs `format:check`, `lint`, `typecheck`, `test`, `build` and `e2e`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Status | Task |
|---|---|---|
| `src/data/catalog.ts`, `src/data/catalog.test.ts` | create | 1 |
| `src/ui/menu/MenuScreen.tsx`, `CountrySelect.tsx`, `MountainSelect.tsx` | create | 2 |
| `src/app/app.css` | modify | 2 |
| `src/app/App.tsx`, `src/app/GameView.tsx`, `src/ui/Hud.tsx` | modify | 3 |
| `e2e/menu.spec.ts` | create | 3 |
| `README.md`, `CLAUDE.md` | modify | 3 |

---

### Task 1: Catalog of countries and peaks

**Files:**
- Create: `src/data/catalog.ts`
- Create: `src/data/catalog.test.ts`

**Interfaces:**
- Consumes: `getMountain(id): MountainDef | null` from `src/data/mountains/index.ts`.
- Produces:
  - `type CountryCode = 'NP' | 'IN' | 'BD'`
  - `interface Country { code; name; flag }`
  - `interface PeakEntry { id; name; country: CountryCode; elevationM; approximate; note?; mountainId? }`
  - `COUNTRIES` and `PEAKS`
  - `getCountry(code): Country`
  - `isPlayable(peak): boolean`
  - `peaksIn(code): PeakEntry[]`
  - `formatElevation(peak): string`

- [ ] **Step 1: Write the failing test**

`src/data/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  PEAKS,
  formatElevation,
  getCountry,
  isPlayable,
  peaksIn,
  type PeakEntry,
} from './catalog';
import { getMountain } from './mountains';

describe('catalog', () => {
  it('lists Nepal, India and Bangladesh, each with at least one peak', () => {
    expect(COUNTRIES.map((c) => c.code)).toEqual(['NP', 'IN', 'BD']);
    for (const c of COUNTRIES) expect(peaksIn(c.code).length).toBeGreaterThan(0);
  });

  it('has unique peak ids and positive elevations', () => {
    expect(new Set(PEAKS.map((p) => p.id)).size).toBe(PEAKS.length);
    for (const p of PEAKS) expect(p.elevationM).toBeGreaterThan(0);
  });

  it('links every mountainId to a baked mountain definition', () => {
    for (const p of PEAKS) {
      if (p.mountainId !== undefined) expect(getMountain(p.mountainId)).not.toBeNull();
    }
  });

  it('makes Mera Peak playable and everything else coming soon', () => {
    expect(PEAKS.filter(isPlayable).map((p) => p.id)).toEqual(['mera-peak']);
    const unbaked: PeakEntry = {
      id: 'x',
      name: 'X',
      country: 'NP',
      elevationM: 1,
      approximate: false,
      mountainId: 'not-baked',
    };
    expect(isPlayable(unbaked)).toBe(false);
  });

  it('lists playable peaks first and otherwise keeps catalog order', () => {
    expect(peaksIn('NP').map((p) => p.id)).toEqual(['mera-peak', 'island-peak', 'everest']);
    expect(peaksIn('IN').map((p) => p.id)).toEqual(['kangchenjunga', 'nanda-devi', 'stok-kangri']);
    expect(peaksIn('BD').map((p) => p.id)).toEqual(['saka-haphong', 'keokradong']);
  });

  it('finds countries by code', () => {
    expect(getCountry('BD')).toEqual({ code: 'BD', name: 'Bangladesh', flag: '🇧🇩' });
  });

  it('formats elevations with thousands separators and ≈ for approximate heights', () => {
    const mera = PEAKS.find((p) => p.id === 'mera-peak')!;
    const keokradong = PEAKS.find((p) => p.id === 'keokradong')!;
    expect(formatElevation(mera)).toBe('6,476 m');
    expect(formatElevation(keokradong)).toBe('≈ 986 m');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/catalog.test.ts`
Expected: FAIL, because `./catalog` cannot be resolved.

- [ ] **Step 3: Implement**

`src/data/catalog.ts`:

```ts
import { getMountain } from './mountains';

export type CountryCode = 'NP' | 'IN' | 'BD';

export interface Country {
  code: CountryCode;
  name: string;
  flag: string;
}

export interface PeakEntry {
  id: string;
  name: string;
  country: CountryCode;
  elevationM: number;
  /** Surveys disagree; shown with "≈". */
  approximate: boolean;
  note?: string;
  /** Set only when the peak has baked terrain: a `MountainDef` id. */
  mountainId?: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
];

const SURVEYS_VARY = 'Heights vary between surveys';

/** Country and mountain select (spec 2026-11-06 §3). Unbaked peaks show "Coming soon". */
export const PEAKS: readonly PeakEntry[] = [
  {
    id: 'mera-peak',
    name: 'Mera Peak',
    country: 'NP',
    elevationM: 6476,
    approximate: false,
    mountainId: 'mera-peak',
  },
  { id: 'island-peak', name: 'Island Peak', country: 'NP', elevationM: 6189, approximate: false },
  { id: 'everest', name: 'Mount Everest', country: 'NP', elevationM: 8849, approximate: false },
  {
    id: 'kangchenjunga',
    name: 'Kangchenjunga',
    country: 'IN',
    elevationM: 8586,
    approximate: false,
    note: 'On the Nepal–India border',
  },
  { id: 'nanda-devi', name: 'Nanda Devi', country: 'IN', elevationM: 7816, approximate: false },
  { id: 'stok-kangri', name: 'Stok Kangri', country: 'IN', elevationM: 6153, approximate: false },
  {
    id: 'saka-haphong',
    name: 'Saka Haphong',
    country: 'BD',
    elevationM: 1050,
    approximate: true,
    note: SURVEYS_VARY,
  },
  {
    id: 'keokradong',
    name: 'Keokradong',
    country: 'BD',
    elevationM: 986,
    approximate: true,
    note: SURVEYS_VARY,
  },
];

export function getCountry(code: CountryCode): Country {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) throw new Error(`Unknown country "${code}"`);
  return country;
}

export const isPlayable = (peak: PeakEntry): boolean =>
  peak.mountainId !== undefined && getMountain(peak.mountainId) !== null;

/** The country's peaks, playable ones first, otherwise in catalog order. */
export function peaksIn(code: CountryCode): PeakEntry[] {
  const peaks = PEAKS.filter((p) => p.country === code);
  return [...peaks.filter(isPlayable), ...peaks.filter((p) => !isPlayable(p))];
}

export const formatElevation = (peak: PeakEntry): string =>
  `${peak.approximate ? '≈ ' : ''}${peak.elevationM.toLocaleString('en-US')} m`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/data/catalog.ts src/data/catalog.test.ts
git commit -m "feat(menu): catalog of countries and peaks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Menu screens and styles

**Files:**
- Create: `src/ui/menu/MenuScreen.tsx`, `src/ui/menu/CountrySelect.tsx`, `src/ui/menu/MountainSelect.tsx`
- Modify: `src/app/app.css` (append)

**Interfaces:**
- Consumes: Task 1 exports (`COUNTRIES`, `peaksIn`, `isPlayable`, `formatElevation`, `Country`, `CountryCode`).
- Produces:
  - `MenuScreen({ subtitle, back?, children })`
  - `CountrySelect({ onSelect: (code: CountryCode) => void })`
  - `MountainSelect({ country: Country, onClimb: (mountainId: string) => void, onBack: () => void })`

There are no unit tests, because the project's Vitest has no DOM. This task is verified by `typecheck`, `lint` and `build`, and Task 3's e2e exercises these components.

- [ ] **Step 1: `src/ui/menu/MenuScreen.tsx`**

```tsx
import type { ReactNode } from 'react';

const DEM_ATTRIBUTION = 'Contains modified Copernicus DEM data';

interface MenuScreenProps {
  subtitle: string;
  back?: { label: string; onClick: () => void };
  children: ReactNode;
}

/** Shared frame for the menu screens: title, optional back button, card grid, attribution. */
export function MenuScreen({ subtitle, back, children }: MenuScreenProps) {
  return (
    <main className="menu">
      <header className="menu__header">
        {back && (
          <button type="button" className="menu__back" onClick={back.onClick}>
            ‹ {back.label}
          </button>
        )}
        <h1 className="menu__title">Mountain Odyssey</h1>
        <h2 className="menu__subtitle">{subtitle}</h2>
      </header>
      <div className="menu__grid">{children}</div>
      <footer className="menu__credit">{DEM_ATTRIBUTION}</footer>
    </main>
  );
}
```

- [ ] **Step 2: `src/ui/menu/CountrySelect.tsx`**

```tsx
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
```

- [ ] **Step 3: `src/ui/menu/MountainSelect.tsx`**

```tsx
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
```

- [ ] **Step 4: Append styles to `src/app/app.css`**

```css
.menu {
  box-sizing: border-box;
  min-height: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 48px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.menu__header {
  display: grid;
  gap: 6px;
}

.menu__back {
  justify-self: start;
  margin-bottom: 8px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.menu__title {
  margin: 0;
  font-size: 36px;
  letter-spacing: 0.02em;
}

.menu__subtitle {
  margin: 0;
  font-size: 18px;
  font-weight: 400;
  opacity: 0.8;
}

.menu__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.menu__credit {
  margin-top: auto;
  font-size: 11px;
  opacity: 0.7;
}

.card {
  display: grid;
  justify-items: start;
  gap: 6px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease;
}

.card:hover:not(:disabled) {
  border-color: #f2b84b;
  background: rgba(255, 255, 255, 0.1);
}

.card:focus-visible,
.menu__back:focus-visible,
.overlay__action:focus-visible {
  outline: 2px solid #f2b84b;
  outline-offset: 2px;
}

.card__flag {
  font-size: 40px;
  line-height: 1;
}

.card__name {
  font-size: 20px;
  font-weight: 700;
}

.card__meta {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.card__note {
  font-size: 12px;
  opacity: 0.7;
}

.card__action {
  margin-top: 8px;
  font-weight: 600;
  color: #f2b84b;
}

.card--soon {
  cursor: not-allowed;
  opacity: 0.55;
}

.card--soon .card__action {
  color: inherit;
}

.overlay--pause p {
  margin: 0;
}

.overlay__action {
  pointer-events: auto;
  justify-self: center;
  padding: 8px 18px;
  border: 0;
  border-radius: 6px;
  background: #f2b84b;
  color: #0d1117;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The components are not mounted yet; Task 3 wires them in.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/ui/menu src/app/app.css
git commit -m "feat(menu): country and mountain select screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Wire the menus into the app, add the pause exit, e2e and docs

**Files:**
- Modify: `src/app/App.tsx`, `src/app/GameView.tsx`, `src/ui/Hud.tsx`
- Create: `e2e/menu.spec.ts`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes:
  - Task 1: `getCountry` and `CountryCode`.
  - Task 2: `CountrySelect` and `MountainSelect`.
  - `getMountain` and `MountainDef` from `src/data/mountains`.
- Produces:
  - `GameView({ mountain, onExit })`
  - `Hud({ onExit? })`
  - `data-testid="game-root"` with `data-mountain={mountain.id}` on the game container.

- [ ] **Step 1: Write the failing e2e test**

`e2e/menu.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('picks a country, then a mountain, then starts loading it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose a country' })).toBeVisible();
  for (const name of ['Nepal', 'India', 'Bangladesh']) {
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByText('Contains modified Copernicus DEM data')).toBeVisible();

  await page.getByRole('button', { name: /Nepal/ }).click();
  await expect(page.getByRole('heading', { name: 'Nepal — choose a mountain' })).toBeVisible();
  const mera = page.getByRole('button', { name: /Mera Peak/ });
  await expect(mera).toBeEnabled();
  await expect(mera).toContainText('6,476 m');
  await expect(mera).toContainText('Climb');
  const island = page.getByRole('button', { name: /Island Peak/ });
  await expect(island).toBeDisabled();
  await expect(island).toContainText('Coming soon');

  await page.getByRole('button', { name: /Countries/ }).click();
  await page.getByRole('button', { name: /Bangladesh/ }).click();
  await expect(page.getByRole('button', { name: /Keokradong/ })).toContainText('≈ 986 m');

  await page.getByRole('button', { name: /Countries/ }).click();
  await page.getByRole('button', { name: /Nepal/ }).click();
  await page.getByRole('button', { name: /Mera Peak/ }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-mountain', 'mera-peak');
  expect(errors).toEqual([]);
});

test('leaves a deep-linked game for the country screen', async ({ page }) => {
  await page.goto('/?mountain=test-peak');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Choose another mountain' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a country' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
```

The first test does not wait for Mera Peak to finish loading, because e2e bakes only `test-peak`. `data-mountain` proves that the game view was mounted for the chosen mountain.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- menu.spec.ts`
Expected: FAIL. The root URL still opens Mera Peak directly, so there is no "Choose a country" heading.

- [ ] **Step 3: `src/ui/Hud.tsx`: optional exit button on the pause overlay**

Change the signature to:

```tsx
export function Hud({ onExit }: { onExit?: () => void }) {
```

Replace the line `{s.paused && <div className="overlay overlay--pause">Click to play · Esc pause</div>}` with:

```tsx
      {s.paused && (
        <div className="overlay overlay--pause">
          <p>Click to play · Esc pause</p>
          {onExit && (
            <button type="button" className="overlay__action" onClick={onExit}>
              Choose another mountain
            </button>
          )}
        </div>
      )}
```

The button sits in the HUD overlay, not on the canvas, so its click does not reach the canvas's click-to-resume listener.

- [ ] **Step 4: `src/app/GameView.tsx`: accept `onExit` and tag the root**

Change the signature to:

```tsx
export function GameView({ mountain, onExit }: { mountain: MountainDef; onExit: () => void }) {
```

Change the root element to:

```tsx
    <div className="game-root" ref={containerRef} data-testid="game-root" data-mountain={mountain.id}>
```

Change `{status === 'ready' && <Hud />}` to `{status === 'ready' && <Hud onExit={onExit} />}`.

Unmounting `GameView` already disposes the `Game` (the effect's cleanup), which also exits pointer lock.

- [ ] **Step 5: `src/app/App.tsx`: screen state**

Replace the file with:

```tsx
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

function Unsupported({ message }: { message: string }) {
  return (
    <div className="overlay overlay--error" role="alert">
      <p>{message}</p>
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
      return <Unsupported message={`Unknown mountain "${screen.id}".`} />;
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
```

`Screens` is a separate component so that `useState` is never called after an early return, which would break the rules of hooks.

- [ ] **Step 6: Run the e2e to verify it passes, plus everything else**

Run: `npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all PASS, including the unchanged `smoke.spec.ts` (deep link and unknown-mountain error).

- [ ] **Step 7: Docs**

1. `CLAUDE.md`:
   - Replace the sentence `Load a specific mountain with \`?mountain=<id>\` (e.g. \`/?mountain=test-peak\`); default is \`mera-peak\`.` with: `Without a query the app opens on the country menu (country → mountain → game). \`?mountain=<id>\` (e.g. \`/?mountain=test-peak\`) skips the menus and loads that mountain directly.`
   - In the "Terrain is data" list, change `Adding a mountain = a bake config + \`src/data/mountains/<id>.json\`, with no engine changes.` to `Adding a mountain = a bake config + \`src/data/mountains/<id>.json\` + setting \`mountainId\` on its entry in \`src/data/catalog.ts\` (which lists every country and peak on the menu), with no engine changes.`
2. `README.md`:
   - Where it explains how to start playing, say the game opens on a country menu: pick Nepal, then Mera Peak (other peaks show "Coming soon"), and Esc → "Choose another mountain" goes back.
   - If the "Mountains" section lists only Mera Peak and Test Peak, add one line: "The menu also lists Island Peak, Everest, Kangchenjunga, Nanda Devi, Stok Kangri, Saka Haphong and Keokradong as coming soon."
   - Match the README's existing style.

- [ ] **Step 8: Commit**

```bash
npm run format
git add src/app src/ui/Hud.tsx e2e/menu.spec.ts README.md CLAUDE.md
git commit -m "feat(menu): open on country and mountain select; return from pause

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
