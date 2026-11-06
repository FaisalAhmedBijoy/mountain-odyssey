# Country and mountain select: design

**Status:** approved in brainstorming (2026-11-06).

**Parent spec:** `2026-11-03-mountain-odyssey-design.md`, §3.1 (player journey), §7.1 (screens) and §12 (M2e and M3).

This adds two screens in front of the game and a way back out of it. It touches only the UI and data layers; the engine does not change.

## 1. Goal and scope

When the page opens, the player picks a country, then a mountain in that country, then climbs it.

**In scope:**
- A **Country** screen with three countries: Nepal, India and Bangladesh.
- A **Mountain** screen that lists that country's peaks.
  - Playable peaks have a **Climb** button.
  - The other peaks show **Coming soon**, disabled.
- A **Choose another mountain** button on the pause overlay. It closes the game and returns to the Mountain screen.
- A catalog of countries and peaks. Only Mera Peak is playable now. Each other peak opens later, once its terrain has been baked (one bake config plus `src/data/mountains/<id>.json`).

**Out of scope:**
- Baking new mountains.
- Main menu, mountain details, expedition prep and settings (M2b and M2e).
- A map or globe (M3).
- Saving the last choice.

## 2. Flow

```
Country screen ──click country──► Mountain screen ──Climb──► Game
      ▲                               │   ▲                    │
      └────────── ‹ Countries ────────┘   └── Esc → "Choose another mountain"
```

- `?mountain=<id>` in the URL skips the menus and loads that mountain directly, as it does today. The e2e tests and `test-peak` rely on this.
- An unknown id still shows the "Unknown mountain" error.
- Without `?mountain`, the app opens on the Country screen. It no longer opens Mera Peak directly.
- Returning from the game unmounts `GameView`. That already disposes the `Game`, frees WebGL and exits pointer lock. The app then shows the Mountain screen of the same country.

## 3. Catalog (first version)

| Country | Peak | Elevation | Playable |
|---|---|---|---|
| 🇳🇵 Nepal | Mera Peak | 6,476 m | **yes** (`mera-peak`) |
| 🇳🇵 Nepal | Island Peak | 6,189 m | no |
| 🇳🇵 Nepal | Mount Everest | 8,849 m | no |
| 🇮🇳 India | Kangchenjunga | 8,586 m | no (note: "on the Nepal–India border") |
| 🇮🇳 India | Nanda Devi | 7,816 m | no |
| 🇮🇳 India | Stok Kangri | 6,153 m | no |
| 🇧🇩 Bangladesh | Saka Haphong | ≈ 1,050 m | no (note: "Heights vary between surveys") |
| 🇧🇩 Bangladesh | Keokradong | ≈ 986 m | no (note: "Heights vary between surveys") |

- Peaks are listed in the order above. Within each country, the playable ones come first.
- An approximate elevation shows "≈".
- `test-peak` is not in the catalog. It is reachable only through the URL.

## 4. Architecture

| File | Status | Responsibility |
|---|---|---|
| `src/data/catalog.ts` (+ `catalog.test.ts`) | create | Catalog data and helpers. |
| `src/ui/menu/CountrySelect.tsx` | create | Country cards: flag, name and peak count. Calls `onSelect(code)`. |
| `src/ui/menu/MountainSelect.tsx` | create | Peak cards for one country, plus a back button. Calls `onClimb(mountainId)` and `onBack()`. |
| `src/app/App.tsx` | modify | Screen state, `country → mountains → game`, and the `?mountain` deep link. |
| `src/app/GameView.tsx` | modify | Accepts `onExit` and passes it to `Hud`. |
| `src/ui/Hud.tsx` | modify | The pause overlay shows a **Choose another mountain** button when `onExit` is given. |
| `src/app/app.css` | modify | Menu and card styles, and a clickable button inside the pause overlay. |
| `e2e/menu.spec.ts` | create | The menu flow. |

**`catalog.ts` exports:**
- `interface Country { code: 'NP' | 'IN' | 'BD'; name: string; flag: string }`
- `interface PeakEntry { id: string; name: string; country: Country['code']; elevationM: number; approximate: boolean; note?: string; mountainId?: string }`. `mountainId` is set only for playable peaks and refers to a `MountainDef` id.
- `COUNTRIES: readonly Country[]`
- `PEAKS: readonly PeakEntry[]`
- `peaksIn(code): PeakEntry[]`, with playable peaks first and catalog order kept otherwise.
- `isPlayable(peak): boolean`, true when `mountainId` resolves through `getMountain`.

**Screen state in `App`:**
- `{ screen: 'countries' } | { screen: 'mountains'; country } | { screen: 'game'; mountain; country | null }`
- `country` is `null` when the game came from a deep link. In that case, "Choose another mountain" goes to the Country screen.

**Pause overlay:**
- The pause overlay is `pointer-events: none` today, so that a click on the canvas resumes the game.
- The new button gets `pointer-events: auto`, and its click calls `onExit` and stops propagation.
- Clicking anywhere else still resumes the game.

**Engine:** no change. The rule that the engine never imports React still holds.

## 5. Visual style

The menus reuse the HUD's palette (`#0d1117` background, light text, translucent dark panels).

- The title "Mountain Odyssey" sits at the top, with a subtitle: "Choose a country" or "{Country} — choose a mountain".
- Cards sit in a responsive grid (`repeat(auto-fit, minmax(220px, 1fr))`). Each card is a `<button>`, so it is keyboard-focusable, and has a visible focus ring.
- A playable card shows the name, the elevation and a **Climb** label, and is highlighted on hover.
- A Coming soon card is dimmed, `disabled` and `aria-disabled`, with a "Coming soon" label.
- The DEM attribution line `Contains modified Copernicus DEM data` stays visible at the bottom of the menu screens.

## 6. Testing

**Unit test (`catalog.test.ts`):**
- Every country has at least one peak.
- Peak ids are unique.
- Every `mountainId` resolves through `getMountain`.
- Mera Peak is playable, and peaks without a `mountainId` are not.
- `peaksIn` puts playable peaks first and keeps catalog order otherwise.
- Elevations are positive.

**e2e (`menu.spec.ts`):**
- The root URL shows the three country cards.
- Nepal → the Mera Peak card has Climb, and the Island Peak card is disabled and shows "Coming soon".
- "‹ Countries" goes back.
- Bangladesh → shows Keokradong.
- Nepal → Mera Peak → Climb shows "Loading Mera Peak…".

The e2e only bakes `test-peak`, so it does not wait for Mera to finish loading.

**Existing e2e:** `smoke.spec.ts` uses `?mountain=test-peak` and keeps passing unchanged.

**Pause button:** one e2e step on `?mountain=test-peak`, after the HUD is ready (the game starts paused). It clicks **Choose another mountain** and expects the Country screen, because the game came from a deep link.

## 7. Spec deviation

§3.1 player journey: a **Country select** step comes before **Mountain select**. Mountain select lists the chosen country's peaks as cards rather than a Nepal map. The parent spec records this as a deviation.
