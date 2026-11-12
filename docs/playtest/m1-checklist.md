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
- [ ] Sprinting and climbing near High Camp drains oxygen; a warning appears below 25; stopping recovers it. About 15 s of continuous climbing at or near an unacclimatized High Camp drains oxygen to 0 before stamina runs out and respawns with "You collapsed from lack of oxygen". At Khare, stamina runs out first.
- [ ] `F` eats food then water, only when supplies are below full.
- [ ] `O` starts a 10-minute bottle; the timer shows; oxygen rises.
- [ ] At a camp, "R — Rest" shows; resting fades the screen ~3 s, refills stamina and warmth and shows the acclimatization toast; away from camp `R` explains why it cannot rest.
- [ ] Acclimatization: the first rest at a camp gives +250 m ("Rested — acclimatized to +250 m"); a second rest there says "already acclimatized here" and does not raise it.
- [ ] Standing still for a long time high up drains warmth; below 30 climbing is visibly slower. Idling near High Camp (outside the camp), warmth falls about 2.7 per minute: about 26 min to reach 30 (slow climbing) and about 37 min to hypothermia.
- [ ] Stamina recovery at Khare is about half of M1's, because oxygen at Khare is 50. Note whether it feels too slow.

## Keokradong

- [ ] Bangladesh → Keokradong → Climb loads a green hill with trees.
- [ ] The orange route runs Boga Lake → Camp 1 → Camp 2 → Summit with no trees on it.
- [ ] The Summit checkpoint is reachable on foot.
- [ ] FPS stays ≥ 30 among the trees.

## Map

- [ ] The minimap shows the route, the camps and an arrow that turns with your walking direction, with north up.
- [ ] Tab opens the full map, with every camp's name and elevation and "Next: … · distance".
- [ ] Reaching a camp turns its dot green, and the next camp turns yellow.
- [ ] FPS is unaffected.

## Patharia Hills

- [ ] Bangladesh → Patharia Hills → Climb loads tea slopes.
- [ ] Hedge rows near you follow the hill's contours, and tea slopes within about 1 km show contour stripes (farther away the tea is a plain green, by design).
- [ ] Shade trees stand scattered on the tea, and steep tilas are forested.
- [ ] The route Tea Estate → Madhabkunda → Ridge Top is clear of hedges and trees.
- [ ] The map shows the three stops.
- [ ] FPS stays ≥ 30.

## Visual realism

- [ ] `/?mountain=test-peak`: the ground is green, whiter uphill, with an orange disc on the mound 512 m east and 512 m north of the centre (if the disc is south or west, the image is flipped).
- [ ] `/?mountain=patharia`: far hills show satellite colours; ground near the player still shows palette detail (tea stripes, brown steep banks).
- [ ] The character has flat two-tone shading and a thin dark-brown edge, still animates walking, running and falling, and the outline moves with the limbs (small gaps at the robot's sharp corners are expected).
- [ ] The character stands left of the screen centre and the camera is closer than before; `C` cycles three distances.
- [ ] Running (`Shift` + `W`) gives a small rhythmic bob that fades in and out smoothly.
- [ ] Walking off the 8 m cliff band on test-peak (about 300 m from the summit) shakes the camera on landing; a step down of less than half a metre does not.
- [ ] While paused (`Esc`) the view is perfectly still and the clouds stop.
- [ ] Climbing still looks as before (side offset 0.8 m, extra distance).
- [ ] On test-peak, Patharia, Keokradong and Mera Peak: the sky is bluer overhead and pale at the horizon, with no visible line where far terrain meets the sky.
- [ ] White clouds sit above the highest ground, never touch terrain, drift slowly, and do not run out after a minute of walking.
- [ ] Sunlit ground looks slightly warmer than before; shadows are still visible; frame rate is not visibly worse.

## Equipment (M2b)

- [ ] Nepal → Mera Peak opens the Prep screen with 28.7 / 20 kg, an orange bar and the over-weight warning.
- [ ] Removing O₂ bottles and the tent lowers the weight; under 20 kg the bar turns green and the warning goes.
- [ ] Boots cannot be removed; Back returns to Mountain Select.
- [ ] Without crampons, a steep ice face on the glacier says "Requires ice axe + crampons" and cannot be grabbed.
- [ ] Without gloves, a wall near the summit (below −15 °C) says "Requires gloves (too cold)".
- [ ] Without the jacket, Warmth falls clearly faster above High Camp.
- [ ] With a tent, R away from a camp rests ("Rested in the tent") and does not acclimatize; without one it says "You can only rest at a camp".
- [ ] A heavy pack (all O₂, food and water) feels clearly slower than a light one.
- [ ] The HUD item row shows the pack weight.
