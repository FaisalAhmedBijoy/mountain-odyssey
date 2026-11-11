---
id: 001
title: Visual realism — satellite terrain, illustrated climber, shoulder camera, painterly sky
date: 2026-11-11
status: frozen
---

# 001 — Visual realism

## Original request (verbatim)

> let's discuss. I need to change the background. make it more realisitic. So is it possible to change the background with google earth. like if I run in a hilltrack, the background will load from the google earth sattelite image. give me a suggestion

> both

> I also need some realistic illustrated characted. not human. but it will kind of give first person action type vibe

> not animal & not robot. but a illustrated human

> ghilbi will be good

> make a doc with this plan so well that a less capable model can easily develop it

## Assumptions and corrections (as confirmed)

- Google Earth imagery is not used. Its terms forbid downloading or baking the imagery, and the Map Tiles API needs a key, billing and runtime streaming, which does not fit a free static site. Sentinel-2 (Copernicus, free and open) is used instead, baked offline next to the DEM.
- "Both" means the satellite colour is used far away (backdrop) and close to the player (chunks).
- "Not human" was corrected by the user: the character is an illustrated human. It is not an animal and not a robot.
- The art direction is a soft hand-painted look inspired by Studio Ghibli films. Only the general style is a reference. No Ghibli character, scene or artwork is copied.
- "First person action vibe" is delivered with a close over-the-shoulder camera plus camera shake and run bob. The game stays third-person.
- One spec with four phases that can ship one at a time: terrain imagery, character, camera, sky.
- All three real mountains get imagery. The synthetic test-peak gets a generated image so tests and e2e need no network.
- If a mountain has no imagery, or the image fails to load, the game looks as it does today.
- The `Tab` map keeps its current relief drawing.

## Agreed scope

1. Bake a Sentinel-2 true-colour image per mountain and reference it from `manifest.json`.
2. Draw it on the backdrop and on terrain chunks, blended near the player with the existing biome palette.
3. Give the player model toon shading and a thin dark-brown outline, and make the model replaceable by a CC0 or Mixamo illustrated human climber.
4. Over-the-shoulder camera, landing shake, run bob, all tuned in `game.config.ts`.
5. Gradient sky, drifting clouds, warm sun.
6. Credits, attribution, CLAUDE.md and the design spec updated.

## Out of scope

- Google Earth, Google Maps, Mapbox, Bing or any runtime tile service.
- A satellite `Tab` map.
- True topographic shadow removal from the imagery (only a tone lift).
- First-person view, new gameplay rules, mobile, post-processing passes.
- Creating a character model from scratch (the model is sourced, not authored).
