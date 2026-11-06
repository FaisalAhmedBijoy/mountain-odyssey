import json
import math
import os
from pathlib import Path

import numpy as np
import pytest

from terrain_lib import (
    GridSpec,
    CampPlacementError,
    RouteError,
    bilinear_sample,
    build_routes,
    cell_slope_deg,
    cell_to_world,
    detail_noise,
    downsample,
    find_route,
    find_summit,
    label_components,
    latlon_bounds,
    place_camps,
    quantize,
    resample_to_metric,
    route_length,
    route_markers,
    route_max_slope,
    segment_cells,
    slope_deg,
    spawn_is_walkable,
    split_tiles,
    string_pull,
    synthetic_heightmap,
    upsample,
    validate_camps,
    walkable_map,
    write_terrain,
)


def test_grid_spec_dimensions():
    spec = GridSpec(0.0, 0.0, tiles=2, tile_cells=4, spacing_m=2.0)
    assert spec.samples == 9
    assert spec.size_m == 16.0
    assert spec.origin == -8.0


def test_latlon_bounds_are_centred():
    spec = GridSpec(27.7, 86.87, tiles=24, tile_cells=256, spacing_m=2.0)
    west, south, east, north = latlon_bounds(spec, margin_m=0.0)
    assert (west + east) / 2 == pytest.approx(86.87)
    assert (south + north) / 2 == pytest.approx(27.7)
    assert (north - south) * 111_320.0 == pytest.approx(spec.size_m)


def test_bilinear_sample_interpolates():
    grid = np.array([[0.0, 1.0], [2.0, 3.0]])
    assert bilinear_sample(grid, np.array([0.5]), np.array([0.5]))[0] == pytest.approx(1.5)


def test_resample_to_metric_maps_north_to_row_zero():
    spec = GridSpec(0.0, 0.0, tiles=1, tile_cells=4, spacing_m=2.0)
    bounds = latlon_bounds(spec, margin_m=0.0)
    dem = np.tile(np.arange(11, dtype=np.float32)[:, None], (1, 11))  # value = DEM row, 0 = north
    out = resample_to_metric(dem, bounds, spec, coarse_spacing_m=2.0)
    assert out.shape == (5, 5)
    np.testing.assert_allclose(out[:, 2], [0.0, 2.5, 5.0, 7.5, 10.0], atol=1e-4)


def test_upsample_keeps_constant_surface():
    out = upsample(np.full((5, 5), 42.0, np.float32), 17)
    assert out.shape == (17, 17)
    np.testing.assert_allclose(out, 42.0, atol=1e-3)


def test_detail_noise_is_deterministic_and_bounded():
    a = detail_noise(65, 2.0, seed=1)
    b = detail_noise(65, 2.0, seed=1)
    np.testing.assert_array_equal(a, b)
    assert 0.0 < np.abs(a).max() < 2.4


def test_split_tiles_share_edges():
    h = np.arange(81, dtype=np.float32).reshape(9, 9)
    tiles = split_tiles(h, 4)
    assert set(tiles) == {(0, 0), (1, 0), (0, 1), (1, 1)}
    assert tiles[(0, 0)].shape == (5, 5)
    np.testing.assert_array_equal(tiles[(0, 0)][:, -1], tiles[(1, 0)][:, 0])
    np.testing.assert_array_equal(tiles[(0, 0)][-1, :], tiles[(0, 1)][0, :])


def test_quantize_maps_range_to_uint16():
    q = quantize(np.array([[10.0, 15.0, 20.0]]), 10.0, 20.0)
    assert q.dtype == np.dtype("<u2")
    assert q.tolist() == [[0, 32768, 65535]]


def test_downsample_takes_every_nth_sample():
    h = np.arange(25, dtype=np.float32).reshape(5, 5)
    assert downsample(h, 2).tolist() == [[0, 2, 4], [10, 12, 14], [20, 22, 24]]


def _cone(n=201, spacing=1.0):
    c = (n - 1) / 2
    r, col = np.mgrid[0:n, 0:n]
    return (1000.0 - np.hypot(r - c, col - c) * spacing).astype(np.float32)


def test_find_summit_returns_highest_cell():
    assert find_summit(_cone()) == (100, 100)


def _two_peaks():
    h = np.zeros((101, 101), dtype=np.float32)
    h[50, 50] = 100.0  # central peak
    h[5, 50] = 200.0  # taller peak 45 cells from the centre
    return h


def test_find_summit_without_radius_returns_taller_edge_peak():
    assert find_summit(_two_peaks()) == (5, 50)


def test_find_summit_with_radius_ignores_peaks_outside_it():
    assert find_summit(_two_peaks(), spacing_m=1.0, radius_m=20.0) == (50, 50)
    assert find_summit(_two_peaks(), spacing_m=1.0, radius_m=100.0) == (5, 50)


def test_find_summit_radius_scales_with_spacing():
    # Edge peak is 45 cells away: 45 m at 1 m spacing, 90 m at 2 m spacing.
    assert find_summit(_two_peaks(), spacing_m=1.0, radius_m=60.0) == (5, 50)
    assert find_summit(_two_peaks(), spacing_m=2.0, radius_m=60.0) == (50, 50)


def test_label_components_separates_blobs_with_4_connectivity():
    mask = np.array(
        [
            [1, 1, 0, 0],
            [0, 1, 0, 1],
            [0, 0, 1, 1],
            [1, 0, 0, 0],
        ],
        dtype=bool,
    )
    labels, sizes = label_components(mask)
    assert labels[0, 0] == labels[0, 1] == labels[1, 1] != 0
    assert labels[1, 3] == labels[2, 2] == labels[2, 3] != 0
    assert labels[3, 0] != 0
    assert len({labels[0, 0], labels[1, 3], labels[3, 0]}) == 3
    assert (labels[~mask] == 0).all()
    assert sorted(sizes[1:].tolist()) == [1, 3, 3]


def _plateaus(gap: str, n: int = 201, spacing: float = 2.0) -> np.ndarray:
    """Low plateau (1000 m) in the west, high plateau (1100 m) in the east, joined in
    the middle either by a ~14 degree ramp or by a vertical cliff."""
    x = np.arange(n) * spacing
    width = 400.0 if gap == "ramp" else 2.0
    mid = (x[-1] - x[0]) / 2.0
    profile = 1000.0 + 100.0 * np.clip((x - (mid - width / 2.0)) / width, 0.0, 1.0)
    return np.tile(profile.astype(np.float32), (n, 1))


CAMPS = [
    {"id": "low", "targetElevationM": 1000.0},
    {"id": "high", "targetElevationM": 1100.0},
]


def test_place_camps_on_plateaus_joined_by_ramp_validates():
    h = _plateaus("ramp", n=401)
    rcs = place_camps(h, 2.0, (200, 400), CAMPS, tolerance_m=10.0)
    assert len(rcs) == 2
    assert abs(h[rcs[0]] - 1000.0) <= 1.0
    assert abs(h[rcs[1]] - 1100.0) <= 1.0
    validate_camps(h, 2.0, list(zip(["low", "high"], rcs)))


def test_validate_camps_fails_when_camps_are_split_by_a_cliff():
    h = _plateaus("cliff")
    low, high = (100, 20), (100, 180)
    with pytest.raises(CampPlacementError, match="low.*high.*not connected"):
        validate_camps(h, 2.0, [("low", low), ("high", high)])


def test_place_camps_fails_when_no_walkable_component_spans_all_targets():
    with pytest.raises(CampPlacementError, match="no walkable component"):
        place_camps(_plateaus("cliff"), 2.0, (100, 180), CAMPS, tolerance_m=10.0)


def _flat_with_spike(n: int = 101, spacing: float = 2.0) -> np.ndarray:
    """Flat 1000 m plain with a 45 degree spike 8 m tall at the centre."""
    c = (n - 1) / 2
    r, col = np.mgrid[0:n, 0:n]
    d = np.hypot(r - c, col - c) * spacing
    return (1000.0 + np.clip(8.0 - d, 0.0, None)).astype(np.float32)


def test_spawn_on_steep_neighbourhood_is_rejected():
    h = _flat_with_spike()
    assert not spawn_is_walkable(h, 2.0, (50, 52), radius_m=6.0, max_slope_deg=30.0)
    assert spawn_is_walkable(h, 2.0, (50, 80), radius_m=6.0, max_slope_deg=30.0)
    with pytest.raises(CampPlacementError, match="spike.*steep"):
        validate_camps(h, 2.0, [("flat", (50, 80)), ("spike", (50, 52))])


def test_place_camps_skips_steep_spawn_candidates():
    h = _flat_with_spike()
    (rc,) = place_camps(h, 2.0, (50, 50), [{"id": "a", "targetElevationM": 1004.0}], tolerance_m=10.0)
    assert spawn_is_walkable(h, 2.0, rc, radius_m=6.0, max_slope_deg=30.0)


@pytest.mark.parametrize("bearing, expected_rc", [(0.0, (50, 100)), (90.0, (100, 150))])
def test_place_camps_prefers_the_bearing_from_the_summit(bearing, expected_rc):
    h = (0.2 * _cone()).astype(np.float32)  # ~11 degree cone, summit 200 m
    camps = [{"id": "a", "targetElevationM": 190.0, "bearingFromSummitDeg": bearing}]
    ((r, c),) = place_camps(h, 1.0, (100, 100), camps, tolerance_m=2.0)
    assert abs(r - expected_rc[0]) <= 8 and abs(c - expected_rc[1]) <= 8
    assert abs(h[r, c] - 190.0) <= 2.0


def test_walkable_map_labels_analysis_grid_and_maps_full_res_cells():
    h = _plateaus("cliff")
    wm = walkable_map(h, 2.0, max_slope_deg=30.0, analysis_spacing_m=8.0)
    assert wm.step == 4
    assert wm.label_at((100, 20)) != 0
    assert wm.label_at((100, 20)) != wm.label_at((100, 180))


def test_synthetic_test_peak_camps_validate():
    h = synthetic_heightmap(1025, 2.0)
    khare, high_camp = (912, 512), (512, 512)  # (0, 800) and (0, 0) in world metres
    validate_camps(h, 2.0, [("khare", khare), ("high-camp", high_camp)])


def test_synthetic_heightmap_has_mound_at_plus_x_minus_z():
    h = synthetic_heightmap(1025, 2.0)
    # world (x=512, z=-512) is row 256, col 768; its mirror images stay on the plain
    assert h[256, 768] == pytest.approx(5020.0, abs=0.5)
    assert h[768, 768] == pytest.approx(5000.0, abs=0.01)
    assert h[256, 256] == pytest.approx(5000.0, abs=0.01)
    assert h[768, 256] == pytest.approx(5000.0, abs=0.01)


def test_slope_deg_of_45_degree_ramp():
    h = np.tile(np.arange(10, dtype=np.float32), (10, 1))
    assert slope_deg(h, 1.0)[5, 5] == pytest.approx(45.0)


def test_synthetic_heightmap_has_plain_cone_and_cliff():
    h = synthetic_heightmap(1025, 2.0)
    assert h[0, 0] == pytest.approx(5000.0)
    assert h[512, 512] == pytest.approx(5248.0, abs=0.5)
    assert slope_deg(h, 2.0).max() > 50.0


def test_cell_to_world():
    h = np.zeros((5, 5), np.float32)
    h[1, 3] = 7.0
    assert cell_to_world((1, 3), -4.0, 2.0, h) == [2.0, 7.0, -2.0]


def test_write_terrain_outputs_manifest_tiles_and_backdrop(tmp_path):
    spec = GridSpec(0.0, 0.0, tiles=2, tile_cells=4, spacing_m=2.0)
    h = np.linspace(100, 200, spec.samples**2, dtype=np.float32).reshape(spec.samples, spec.samples)
    camps = [
        {"id": "a", "name": "A", "position": [0.0, 100.0, 0.0]},
        {"id": "b", "name": "B", "position": [1.0, 150.0, 1.0]},
    ]
    manifest = write_terrain(
        tmp_path, "demo", h, spec.spacing_m, spec.tile_cells, spec.origin, camps, "Test", backdrop_spacing_m=4.0
    )
    assert manifest["tileSamples"] == 5
    assert manifest["tilesX"] == 2 and manifest["tilesZ"] == 2
    assert manifest["originX"] == -8.0 and manifest["originZ"] == -8.0
    assert (tmp_path / "tiles" / "1_1.u16").stat().st_size == 5 * 5 * 2
    assert manifest["backdrop"] == {"file": "backdrop.u16", "samples": 5, "spacingM": 4.0}
    assert (tmp_path / "backdrop.u16").stat().st_size == 5 * 5 * 2
    assert json.loads((tmp_path / "manifest.json").read_text())["camps"][1]["id"] == "b"


def test_written_tile_decodes_back_to_heights(tmp_path):
    spec = GridSpec(0.0, 0.0, tiles=2, tile_cells=4, spacing_m=2.0)
    r, c = np.mgrid[0 : spec.samples, 0 : spec.samples]
    h = (100 + c + 10 * r).astype(np.float32)  # asymmetric, so a transpose shows up
    camps = [
        {"id": "a", "name": "A", "position": [0.0, 100.0, 0.0]},
        {"id": "b", "name": "B", "position": [1.0, 150.0, 1.0]},
    ]
    manifest = write_terrain(
        tmp_path, "demo", h, spec.spacing_m, spec.tile_cells, spec.origin, camps, "Test", backdrop_spacing_m=4.0
    )
    lo, hi = manifest["minHeightM"], manifest["maxHeightM"]
    tol = (hi - lo) / 65535

    def decode(path):
        raw = np.frombuffer(path.read_bytes(), dtype="<u2").reshape(5, 5)
        return lo + raw.astype(np.float64) / 65535 * (hi - lo)

    # tile (tx=1, tz=0) covers grid rows 0..4 and cols 4..8
    np.testing.assert_allclose(decode(tmp_path / "tiles" / "1_0.u16"), h[0:5, 4:9], atol=tol)
    # backdrop is every 2nd sample of the 9x9 grid
    np.testing.assert_allclose(decode(tmp_path / "backdrop.u16"), h[::2, ::2], atol=tol)


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "src/engine/world/__fixtures__/test-peak-mini"


def test_contract_fixture_matches_current_bake(tmp_path):
    """The committed low-res test-peak that the TypeScript contract test
    (src/engine/world/terrainContract.test.ts) reads must match what the bake writes
    today. Regenerate with UPDATE_FIXTURES=1."""
    from bake import bake_synthetic

    spec = GridSpec(0.0, 0.0, tiles=2, tile_cells=16, spacing_m=64.0)
    out = FIXTURE_DIR if os.environ.get("UPDATE_FIXTURES") == "1" else tmp_path
    manifest = bake_synthetic(str(out), spec, backdrop_spacing_m=128.0, validate=False)
    assert json.loads((FIXTURE_DIR / "manifest.json").read_text()) == manifest
    for name in ["backdrop.u16", *(f"tiles/{tx}_{tz}.u16" for tx in range(2) for tz in range(2))]:
        assert (FIXTURE_DIR / name).read_bytes() == (out / name).read_bytes(), name


def _route_plateaus(connected: bool) -> np.ndarray:
    """401 x 401 cells at 2 m: a 5000 m plateau in the south, a 5100 m plateau in the
    north, joined by a ~22.6 degree ramp (connected) or a 100 m cliff (not connected)."""
    n = 401
    rows = np.repeat(np.arange(n, dtype=np.float64)[:, None], n, axis=1)
    if connected:
        h = np.interp(rows.ravel(), [140.0, 260.0], [5100.0, 5000.0]).reshape(n, n)
    else:
        h = np.where(rows < 200, 5100.0, 5000.0)
    return h.astype(np.float32)


ROUTE_START, ROUTE_GOAL, ROUTE_ORIGIN, ROUTE_SPACING = (360, 200), (40, 200), -400.0, 2.0


def test_find_route_follows_walkable_ramp():
    h = _route_plateaus(True)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    pts = find_route(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, ROUTE_START, ROUTE_GOAL)
    start = cell_to_world(ROUTE_START, ROUTE_ORIGIN, ROUTE_SPACING, h)
    goal = cell_to_world(ROUTE_GOAL, ROUTE_ORIGIN, ROUTE_SPACING, h)
    assert pts[0][0] == pytest.approx(start[0], abs=0.1) and pts[0][2] == pytest.approx(start[2], abs=0.1)
    assert pts[-1][0] == pytest.approx(goal[0], abs=0.1) and pts[-1][2] == pytest.approx(goal[2], abs=0.1)
    steps = [math.hypot(b[0] - a[0], b[2] - a[2]) for a, b in zip(pts, pts[1:])]
    assert max(steps) <= 20.0 + 1e-6
    slope = slope_deg(h, ROUTE_SPACING)
    for x, _, z in pts:
        r = int(round((z - ROUTE_ORIGIN) / ROUTE_SPACING))
        c = int(round((x - ROUTE_ORIGIN) / ROUTE_SPACING))
        assert slope[r, c] < 30.0
    # The ramp is straight, so the smoothed route is a straight 640 m line rising 100 m.
    assert route_length(pts) == pytest.approx(math.hypot(640.0, 100.0), rel=0.02)


def test_find_route_raises_when_a_cliff_separates_the_cells():
    h = _route_plateaus(False)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    with pytest.raises(RouteError, match="not connected"):
        find_route(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, ROUTE_START, ROUTE_GOAL)


def test_route_markers_every_100_m_and_at_turns():
    straight = [[0.0, 0.0, -20.0 * i] for i in range(51)]  # 1000 m north
    assert [round(-p[2]) for p in route_markers(straight)] == [100, 200, 300, 400, 500, 600, 700, 800, 900]
    corner = [[20.0 * i, 0.0, 0.0] for i in range(16)] + [[300.0, 0.0, 20.0 * i] for i in range(1, 16)]
    assert [(round(p[0]), round(p[2])) for p in route_markers(corner)] == [
        (100, 0), (200, 0), (300, 0), (300, 100), (300, 200)
    ]
    short = [[0.0, 0.0, -20.0 * i] for i in range(7)]  # 120 m: the 100 m mark is 20 m from the end
    assert route_markers(short) == []


def test_build_routes_names_the_camps_when_no_route_exists():
    h = _route_plateaus(False)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    with pytest.raises(RouteError, match="no walkable route from a to b"):
        build_routes(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, [("a", ROUTE_START), ("b", ROUTE_GOAL)])


def test_build_routes_returns_manifest_ready_dicts():
    h = _route_plateaus(True)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    (route,) = build_routes(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, [("a", ROUTE_START), ("b", ROUTE_GOAL)])
    assert set(route) == {"from", "to", "lengthM", "points", "markers"}
    assert (route["from"], route["to"]) == ("a", "b")
    assert route["lengthM"] == float(round(route_length(route["points"])))
    assert route["markers"] == route_markers(route["points"])


def test_bake_synthetic_writes_a_route_through_the_south_ramp(tmp_path):
    from bake import bake_synthetic

    m = bake_synthetic(str(tmp_path))
    (route,) = m["routes"]
    assert (route["from"], route["to"]) == ("khare", "high-camp")
    khare, high = (c["position"] for c in m["camps"])
    assert route["points"][0][0] == pytest.approx(khare[0], abs=0.1)
    assert route["points"][0][2] == pytest.approx(khare[2], abs=0.1)
    assert route["points"][-1][0] == pytest.approx(high[0], abs=0.1)
    assert route["points"][-1][2] == pytest.approx(high[2], abs=0.1)
    assert 780.0 <= route["lengthM"] <= 1000.0
    ramp = [p for p in route["points"] if 280.0 <= p[2] <= 320.0]
    assert ramp and all(abs(p[0]) < 80.0 for p in ramp)
    assert json.loads((tmp_path / "manifest.json").read_text())["routes"] == m["routes"]


def _max_bilinear_slope_along(pts, h, spacing=ROUTE_SPACING, origin=ROUTE_ORIGIN, step_m=0.25):
    """Independent check: steepest bilinear slope in any 2 m cell the route passes through
    (sampled every step_m), i.e. the steepest ground the engine can measure under it."""
    worst = 0.0
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[2] - a[2]) / step_m)))
        for k in range(n + 1):
            x = a[0] + (b[0] - a[0]) * k / n
            z = a[2] + (b[2] - a[2]) * k / n
            r = min(int((z - origin) / spacing), h.shape[0] - 2)
            c = min(int((x - origin) / spacing), h.shape[1] - 2)
            q = h[r : r + 2, c : c + 2].astype(np.float64)
            gx = np.abs(q[:, 1] - q[:, 0]).max() / spacing
            gz = np.abs(q[1, :] - q[0, :]).max() / spacing
            worst = max(worst, math.degrees(math.atan(math.hypot(gx, gz))))
    return worst


def _ridge_plain(gap: bool) -> np.ndarray:
    """Flat 5000 m plain (401 x 401 at 2 m) crossed west-east by a 1.5 m ridge one sample
    wide on row 201 (z = +2 m). The 8 m analysis grid (every 4th row) never samples it,
    so it looks walkable there, but its 2 m cells are ~37 degrees. With gap=True the
    ridge has a 60 m opening at cols 300..330 (x = +200..+260 m)."""
    h = np.full((401, 401), 5000.0, np.float32)
    h[201, :] += 1.5
    if gap:
        h[201, 300:331] = 5000.0
    return h


def test_cell_slope_deg_is_the_steepest_bilinear_slope_in_each_cell():
    h = np.array([[0.0, 1.0, 1.0], [0.0, 3.0, 1.0], [0.0, 0.0, 0.0]], np.float32)
    cs = cell_slope_deg(h, 2.0)
    assert cs.shape == (2, 2)
    # cell (0, 0): steepest x edge |3 - 0| = 3, steepest z edge |3 - 1| = 2 -> atan(hypot(1.5, 1))
    assert cs[0, 0] == pytest.approx(math.degrees(math.atan(math.hypot(1.5, 1.0))), abs=1e-4)
    assert cs[1, 0] == pytest.approx(math.degrees(math.atan(math.hypot(1.5, 1.5))), abs=1e-4)


def test_8m_grid_cannot_see_the_ridge():
    wm = walkable_map(_ridge_plain(False), ROUTE_SPACING, 30.0, 8.0)
    assert wm.label_at(ROUTE_START) == wm.label_at(ROUTE_GOAL) != 0
    assert cell_slope_deg(_ridge_plain(False), ROUTE_SPACING).max() > 36.0


def test_find_route_detours_around_a_2m_feature_steeper_than_the_limit():
    h = _ridge_plain(True)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    pts = find_route(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, ROUTE_START, ROUTE_GOAL, max_slope_deg=33.0)
    assert _max_bilinear_slope_along(pts, h) < 33.0
    crossings = [
        a[0] + (b[0] - a[0]) * (2.0 - a[2]) / (b[2] - a[2])
        for a, b in zip(pts, pts[1:])
        if (a[2] - 2.0) * (b[2] - 2.0) <= 0 and a[2] != b[2]
    ]
    assert crossings and all(200.0 < x < 260.0 for x in crossings)


def test_find_route_raises_when_a_2m_feature_blocks_every_path():
    h = _ridge_plain(False)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    with pytest.raises(RouteError, match="not connected"):
        find_route(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, ROUTE_START, ROUTE_GOAL, max_slope_deg=33.0)


def test_route_max_slope_reports_the_steepest_cell_and_its_location():
    h = _ridge_plain(False)
    straight = [[0.0, 5000.0, 300.0], [0.0, 5000.0, -300.0]]  # crosses the ridge at z = +2
    worst, x, z = route_max_slope(straight, cell_slope_deg(h, ROUTE_SPACING), ROUTE_SPACING, ROUTE_ORIGIN)
    assert worst > 36.0
    assert x == pytest.approx(0.0) and 0.0 <= z <= 4.0
    flat = [[0.0, 5000.0, 300.0], [0.0, 5000.0, 100.0]]
    assert route_max_slope(flat, cell_slope_deg(h, ROUTE_SPACING), ROUTE_SPACING, ROUTE_ORIGIN)[0] == 0.0


def test_build_routes_rejects_a_route_steeper_than_the_limit(monkeypatch):
    import terrain_lib

    h = _ridge_plain(False)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    straight = [[0.0, 5000.0, 320.0], [0.0, 5000.0, -320.0]]
    monkeypatch.setattr(terrain_lib, "find_route", lambda *a, **k: straight)
    with pytest.raises(RouteError, match=r"a to b .*steeper than 33 deg at x=0, z=[0-4]"):
        build_routes(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, [("a", ROUTE_START), ("b", ROUTE_GOAL)],
                     max_slope_deg=33.0)


def test_route_slope_limit_is_33_degrees_and_written_to_the_manifest(tmp_path):
    from bake import CAMP_PLACEMENT_DEFAULTS, bake_synthetic

    assert CAMP_PLACEMENT_DEFAULTS["routeMaxSlopeDeg"] == 33.0
    assert CAMP_PLACEMENT_DEFAULTS["maxWalkSlopeDeg"] == 30.0  # camps stay stricter
    m = bake_synthetic(str(tmp_path))
    assert m["routeMaxSlopeDeg"] == 33.0
    h = synthetic_heightmap(1025, 2.0)
    assert _max_bilinear_slope_along(m["routes"][0]["points"], h, 2.0, -1024.0) < 33.0


def test_engine_heights_match_the_written_tiles(tmp_path):
    """Routes are judged on the heights the engine decodes from the uint16 tiles, since
    quantisation can move a 2 m cell's slope by ~1 degree on a 3 km height range."""
    from terrain_lib import engine_heights

    spec = GridSpec(0.0, 0.0, tiles=2, tile_cells=4, spacing_m=2.0)
    rng = np.random.default_rng(3)
    h = (5000 + 3000 * rng.random((spec.samples, spec.samples))).astype(np.float32)
    m = write_terrain(tmp_path, "demo", h, 2.0, 4, spec.origin, [], "Test", backdrop_spacing_m=4.0)
    raw = np.frombuffer((tmp_path / "tiles" / "1_1.u16").read_bytes(), dtype="<u2").reshape(5, 5)
    decoded = m["minHeightM"] + raw.astype(np.float64) / 65535 * (m["maxHeightM"] - m["minHeightM"])
    np.testing.assert_allclose(engine_heights(h)[4:9, 4:9], decoded, atol=1e-3)
    assert np.abs(engine_heights(h) - h).max() > 1e-3  # quantisation is visible


def test_route_max_slope_checks_every_cell_a_segment_crosses():
    """A segment that clips the corner of one steep cell for ~1 m is caught even though
    samples every metre along it all miss that cell."""
    cs = np.zeros((20, 20), np.float32)
    cs[5, 5] = 40.0  # x, z in [10, 12)
    seg = [[0.0, 0.0, 23.3], [23.3, 0.0, 0.0]]
    n = math.ceil(math.hypot(23.3, 23.3))
    t = np.arange(n + 1) / n
    assert not ((23.3 * t >= 10) & (23.3 * t < 12) & (23.3 - 23.3 * t >= 10) & (23.3 - 23.3 * t < 12)).any()
    worst, x, z = route_max_slope(seg, cs, 2.0, 0.0)
    assert worst == 40.0
    assert 10.0 <= x <= 12.0 and 10.0 <= z <= 12.0


def test_route_markers_restart_the_count_after_a_turn_and_skip_close_distance_markers():
    # 80 m north, then east to x = 400 (480 m). The turn marker at 80 m restarts the
    # 100 m count, so the next marker is at 180 m, not 100 m (20 m after the turn).
    turn_early = [[0.0, 0.0, -20.0 * i] for i in range(5)] + [[20.0 * i, 0.0, -80.0] for i in range(1, 21)]
    assert [(round(p[0]), round(p[2])) for p in route_markers(turn_early)] == [(0, -80), (100, -80), (200, -80), (300, -80)]
    # 110 m north then east: the distance marker at 100 m is dropped for the turn marker
    # 10 m later, then the count restarts: 210 m, 310 m.
    turn_late = [[0.0, 0.0, -10.0 * i] for i in range(12)] + [[20.0 * i, 0.0, -110.0] for i in range(1, 16)]
    assert [(round(p[0]), round(p[2])) for p in route_markers(turn_late)] == [(0, -110), (100, -110), (200, -110)]


def _along(points, p, start=0):
    """Horizontal distance along the polyline to point p (on it), searching from segment start."""
    dist = sum(math.hypot(b[0] - a[0], b[2] - a[2]) for a, b in zip(points[:start], points[1 : start + 1]))
    for i in range(start, len(points) - 1):
        a, b = points[i], points[i + 1]
        seg = math.hypot(b[0] - a[0], b[2] - a[2])
        t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[2] - a[2]) * (b[2] - a[2])) / (seg * seg)
        q = (a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t)
        if -1e-3 <= t <= 1 + 1e-3 and math.hypot(q[0] - p[0], q[1] - p[2]) < 0.2:
            return dist + seg * min(max(t, 0.0), 1.0), i
        dist += seg
    raise AssertionError(f"marker {p} is not on the route")


@pytest.mark.parametrize("seed", range(5))
def test_only_turn_markers_come_closer_than_30_m_to_each_other(seed):
    rng = np.random.default_rng(seed)
    pts, heading = [[0.0, 0.0, 0.0]], 0.0
    for _ in range(150):  # 20 m legs with random turns of up to +/-50 degrees
        heading += math.radians(rng.uniform(-50.0, 50.0)) if rng.random() < 0.3 else 0.0
        pts.append([pts[-1][0] + 20.0 * math.sin(heading), 0.0, pts[-1][2] - 20.0 * math.cos(heading)])
    turns = {
        (round(b[0], 1), round(b[2], 1))
        for a, b, c in zip(pts, pts[1:], pts[2:])
        if abs((math.atan2(c[2] - b[2], c[0] - b[0]) - math.atan2(b[2] - a[2], b[0] - a[0]) + math.pi)
               % (2 * math.pi) - math.pi) > math.radians(30.0)
    }
    markers = route_markers(pts)
    assert len(markers) > 10
    prev, prev_turn, seg = None, False, 0
    for m in markers:
        at, seg = _along(pts, m, seg)
        is_turn = (m[0], m[2]) in turns
        if prev is not None and not (is_turn and prev_turn):
            assert at - prev >= 30.0 - 0.2
        prev, prev_turn = at, is_turn


def test_build_routes_puts_markers_on_the_terrain():
    n = 401
    rows = np.repeat(np.arange(n, dtype=np.float64)[:, None], n, axis=1)
    h = (5000.0 + 2.0 * np.sin(rows * 2.0 / 7.0)).astype(np.float32)  # 44 m waves, ~16 degrees
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    # 630 m, so the 20 m route points (19.7 m apart) do not land on the 100 m marks.
    (route,) = build_routes(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, [("a", ROUTE_START), ("b", (45, 200))])
    assert route["markers"]
    for x, y, z in route["markers"]:
        terrain = bilinear_sample(h, np.array([(z - ROUTE_ORIGIN) / 2.0]), np.array([(x - ROUTE_ORIGIN) / 2.0]))[0]
        assert y == pytest.approx(terrain, abs=0.051)
    # Interpolating between the 20 m route points would miss the waves by up to ~2 m.
    assert max(abs(m[1] - 5000.0) for m in route["markers"]) > 0.5


def test_string_pull_keeps_the_farthest_visible_point_not_the_first_blocked_one():
    cs = np.zeros((30, 30), np.float32)
    cs[7, 7] = 45.0  # steep cell at x, z in [14, 16): blocks A -> C but not A -> D
    def clear(a, b):
        r, c, _, _ = segment_cells(a, b, 0.0, 2.0)
        return not (cs[r, c] >= 33.0).any()

    a, b, c, d = (0.5, 0.5), (20.5, 0.5), (20.5, 20.5), (40.5, 20.5)
    assert not clear(a, c) and clear(a, d)
    assert string_pull([a, b, c, d], clear) == [a, d]
    assert string_pull([a, b, c, d], clear, max_lookahead=2) == [a, b, d]


from bake import walk_targets  # noqa: E402


def test_walk_targets_excludes_summit_by_default():
    camps = [{"id": "a"}, {"id": "b"}]
    cells = [(1, 1), (2, 2)]
    assert walk_targets(camps, cells, (9, 9), False) == [("a", (1, 1)), ("b", (2, 2))]


def test_walk_targets_appends_summit_when_walkable():
    camps = [{"id": "a"}]
    assert walk_targets(camps, [(1, 1)], (9, 9), True) == [("a", (1, 1)), ("summit", (9, 9))]


def _write_test_dem(path, west=92.4, south=21.9, east=92.5, north=22.0, size=50):
    import rasterio
    from rasterio.transform import from_bounds as transform_from_bounds

    data = np.arange(size * size, dtype=np.float32).reshape(size, size)
    with rasterio.open(
        path, "w", driver="GTiff", width=size, height=size, count=1, dtype="float32",
        crs="EPSG:4326", transform=transform_from_bounds(west, south, east, north, size, size),
    ) as dst:
        dst.write(data, 1)
    return str(path)


def test_load_dem_refuses_a_window_past_the_tile_edge(tmp_path):
    from bake import load_dem

    url = _write_test_dem(tmp_path / "dem.tif")
    # 2048 m grid + 200 m margin centred 21.995 N reaches ~22.006 N, past the 22.0 N edge
    spec = GridSpec(21.995, 92.45, tiles=4, tile_cells=256, spacing_m=2.0)
    with pytest.raises(ValueError, match="centerLat"):
        load_dem(url, spec)


def test_load_dem_returns_the_window_and_its_bounds_when_inside(tmp_path):
    from bake import load_dem

    url = _write_test_dem(tmp_path / "dem.tif")
    spec = GridSpec(21.95, 92.45, tiles=4, tile_cells=256, spacing_m=2.0)
    dem, (west, south, east, north) = load_dem(url, spec)
    w, s, e, n = latlon_bounds(spec)
    px = 0.1 / 50
    # pixel-centre bounds cover the requested area to within one pixel
    assert west <= w + px and east >= e - px and south <= s + px and north >= n - px
    assert (east - west) == pytest.approx((dem.shape[1] - 1) * px)
    assert (north - south) == pytest.approx((dem.shape[0] - 1) * px)
    # row 0 is the northern edge: pixel row index = (22.0 - north) / px - 0.5
    row0 = round((22.0 - north) / px - 0.5)
    col0 = round((west - 92.4) / px - 0.5)
    assert dem[0, 0] == pytest.approx(row0 * 50 + col0)


def test_dem_window_check_passes_for_mera_peak_bounds():
    from bake import check_dem_coverage

    with open(Path(__file__).parent / "mera-peak.config.json") as f:
        cfg = json.load(f)
    spec = GridSpec(cfg["centerLat"], cfg["centerLon"], cfg["tiles"], cfg["tileCells"], cfg["spacingM"])
    check_dem_coverage(latlon_bounds(spec), (86.0, 27.0, 87.0, 28.0))  # tile N27 E086


def test_dem_window_check_passes_for_keokradong_bounds():
    from bake import check_dem_coverage

    with open(Path(__file__).parent / "keokradong.config.json") as f:
        cfg = json.load(f)
    spec = GridSpec(cfg["centerLat"], cfg["centerLon"], cfg["tiles"], cfg["tileCells"], cfg["spacingM"])
    check_dem_coverage(latlon_bounds(spec), (92.0, 21.0, 93.0, 22.0))  # tile N21 E092


def test_keokradong_config_is_walkable_to_the_summit_within_the_route_limit():
    with open(Path(__file__).parent / "keokradong.config.json") as f:
        cfg = json.load(f)
    assert cfg["summitWalkable"] is True
    assert cfg["campPlacement"]["routeMaxSlopeDeg"] <= 33
    assert cfg["attribution"] == "Contains modified Copernicus DEM data"
    assert [c["id"] for c in cfg["camps"]] == ["boga-lake", "camp-1", "camp-2"]
    assert [c["name"] for c in cfg["camps"]] == ["Boga Lake", "Camp 1", "Camp 2"]
    targets = [c["targetElevationM"] for c in cfg["camps"]]
    assert targets == sorted(targets)


@pytest.mark.parametrize("cfg, expected", [({}, False), ({"summitWalkable": True}, True),
                                           ({"summitWalkable": False}, False)])
def test_summit_walkable_reads_a_json_boolean(cfg, expected):
    from bake import summit_walkable

    assert summit_walkable(cfg) is expected


@pytest.mark.parametrize("value", ["true", 1, 0, None, "false"])
def test_summit_walkable_rejects_non_boolean_values(value):
    from bake import summit_walkable

    with pytest.raises(ValueError, match="summitWalkable"):
        summit_walkable({"summitWalkable": value})


def test_summit_name_defaults_to_summit():
    from bake import summit_name

    assert summit_name({}) == "Summit"


def test_summit_name_uses_the_config_value():
    from bake import summit_name

    assert summit_name({"summitName": "Ridge Top"}) == "Ridge Top"


@pytest.mark.parametrize("bad", [1, True, None, ["Ridge Top"]])
def test_summit_name_must_be_a_string(bad):
    from bake import summit_name

    with pytest.raises(ValueError):
        summit_name({"summitName": bad})


def test_patharia_config():
    cfg = json.loads((Path(__file__).parent / "patharia.config.json").read_text())
    assert cfg["summitWalkable"] is True
    assert cfg["summitName"] == "Ridge Top"
    assert [c["id"] for c in cfg["camps"]] == ["tea-estate", "madhabkunda"]
    targets = [c["targetElevationM"] for c in cfg["camps"]]
    assert targets == sorted(targets)
    assert cfg["campPlacement"]["routeMaxSlopeDeg"] <= 33
    assert cfg["attribution"] == "Contains modified Copernicus DEM data"


def test_synthetic_summit_walk_gets_a_route_ending_at_the_summit():
    from bake import TEST_PEAK_SPEC, synthetic_terrain

    spec = TEST_PEAK_SPEC
    h, camp_cells = synthetic_terrain(spec)
    summit = find_summit(h, spacing_m=spec.spacing_m)
    khare = [(name, rc) for camp_id, name, rc in camp_cells if camp_id == "khare"]
    targets = walk_targets([{"id": "khare"}], [khare[0][1]], summit, True)
    wm = walkable_map(h, spec.spacing_m, 30.0, 8.0)
    validate_camps(h, spec.spacing_m, targets, walk_map=wm)
    (route,) = build_routes(h, spec.spacing_m, spec.origin, wm, targets, max_slope_deg=33.0)
    assert (route["from"], route["to"]) == ("khare", "summit")
    sx, _, sz = cell_to_world(summit, spec.origin, spec.spacing_m, h)
    assert route["points"][-1][0] == pytest.approx(sx, abs=0.1)
    assert route["points"][-1][2] == pytest.approx(sz, abs=0.1)
