---
id: 002
title: OSM glacier surfaces — snow and ice from real glacier outlines
date: 2026-11-13
status: frozen
---

# 002 — OSM glacier surfaces

## Original request (verbatim)

> google map or open street map use for more realistic scene generation possible ?

> check with the patharia first

> check for the Mera

> go ahead

> ok

## Assumptions and corrections (as confirmed)

- Google Maps is not used. Its terms forbid downloading and baking its data, and its photorealistic 3D tiles barely cover the Himalaya. OpenStreetMap (ODbL) is used.
- Patharia was checked first. OSM there has buildings and roads, but no tea gardens, waterways or useful forest outlines, so Patharia is not part of this requirement.
- A survey of the Mera terrain square (27.645–27.755° N, 86.808–86.932° E) found the following in OSM:
  - 30 `natural=glacier` ways (about 24 km² fully inside) and 2 glacier multipolygons
  - scree, rock, cliff, ridge, water, wood and scrub
  - 40.7 km of paths and named peaks, hamlets and camps

  The glacier outlines are the most valuable part, so this requirement covers glaciers only.
- Data comes from a pinned, dated Geofabrik extract (the Nepal `.osm.pbf`), downloaded once by the bake and cached. The public Overpass servers refuse automated clients, so they are not used.
- Inside a glacier, ground is snow below 25° slope and ice from 25°. Ground at 40° or steeper is rock everywhere. Outside glaciers, ground is rock. The current 5,300 m snowline rule no longer applies to a mountain that has a mask.
- The mask is one file at 8 m resolution covering the terrain square (about 2.4 MB for Mera).
- Mountains without OSM data, or without an `osm` block in their bake config, keep the current runtime heuristic.
- The attribution gains "© OpenStreetMap contributors".
- The user accepted that the snow colour disappears from the lower trail below the glacier, which is closer to reality.

## Agreed scope

- Bake: read glacier polygons from the pinned extract, rasterise them onto the terrain grid, and write a surface mask plus a manifest entry.
- Engine: surface classification uses the mask when the manifest has one. This affects climb gating, terrain colour (mesh worker and backdrop) and the map image.
- Attribution text for OSM.
- Mera Peak only (test-peak gets a synthetic mask so tests cover the path).

## Out of scope

- Scree, rock, cliff, water, wood and scrub surfaces from OSM.
- OSM trails for routes, and real camp positions (Khare, Base Camp).
- Patharia, Keokradong and any non-Himalayan mountain.
- Splat-map blending weights (soft transitions) and new surface types.
- Fixed ropes and the rest of M2d.
