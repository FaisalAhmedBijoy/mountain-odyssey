# M1 Vertical Slice — Playtest Checklist

Run on the minimum-spec machine (8 GB RAM, integrated GPU) in Chrome, then Firefox and Safari.

## Performance
- [ ] FPS counter stays ≥ 30 while walking for 5 minutes on Mera Peak.
- [ ] First load to "Click to play" is under 15 s on a 25 Mbps connection.
- [ ] No visible cracks or holes between terrain chunks.

## Movement
- [ ] Following the orange ribbon from Khare reaches High Camp on Mera without sliding or climbing.
- [ ] `T` hides and shows the ribbon; flags and the HUD arrow stay visible.
- [ ] Walk, run, jump and land feel responsive; no sliding on flat ground.
- [ ] Slopes ≥ 33° make the character slide.
- [ ] Khare spawn is on walkable ground (no slide on spawn).
- [ ] High Camp is reachable on foot from Khare without climbing more than one stamina bar.
- [ ] Snowline colour change is visible above ~5,300 m.
- [ ] Running stops when stamina hits zero; stamina recovers while walking.

## Climbing
- [ ] "E — Grab" appears only when facing a steep rock face.
- [ ] Climbing moves in all four directions; stamina drains while climbing.
- [ ] Topping out mantles onto the ledge.
- [ ] Space lets go; running out of stamina makes the character fall.

## Falls and checkpoints
- [ ] A 6–15 m fall shows the injury toast and lowers the stamina cap.
- [ ] A fall over 15 m respawns at the last camp with a toast.
- [ ] Reaching High Camp shows "Checkpoint reached: High Camp".

## Camera
- [ ] Mouse orbits; wheel zooms (2–8 m); C cycles distances.
- [ ] The camera never goes underground.
- [ ] While climbing, the camera pulls back so the wall above is visible.

## Fun gate (at least three external players)
- [ ] Each player reached High Camp without help.
- [ ] Each player rated "climbing is fun" ≥ 3/5.
- [ ] Notes on what felt bad: ______

## Survival (M2a)

- [ ] Oxygen, Warmth and Supplies bars and the item row (Food 4 · Water 4 · O₂ 2) show at Khare.
- [ ] Sprinting and climbing near High Camp drains oxygen; a warning appears below 25; stopping recovers it; draining it to 0 respawns with "You collapsed from lack of oxygen".
- [ ] `F` eats food then water, only when supplies are below full.
- [ ] `O` starts a 10-minute bottle; the timer shows; oxygen rises.
- [ ] At a camp, "R — Rest" shows; resting fades the screen ~3 s, refills stamina and warmth and shows the acclimatization toast; away from camp `R` explains why it cannot rest.
- [ ] Standing still for a long time high up drains warmth; below 30 climbing is visibly slower.
