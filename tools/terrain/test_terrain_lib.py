import json

import numpy as np
import pytest

from terrain_lib import (
    GridSpec,
    bilinear_sample,
    cell_to_world,
    detail_noise,
    downsample,
    find_camp,
    find_summit,
    latlon_bounds,
    quantize,
    resample_to_metric,
    slope_deg,
    split_tiles,
    synthetic_heightmap,
    upsample,
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


@pytest.mark.parametrize("bearing, expected_rc", [(0.0, (50, 100)), (90.0, (100, 150))])
def test_find_camp_walks_downhill_along_bearing(bearing, expected_rc):
    h = _cone()
    r, c = find_camp(h, 1.0, (100, 100), bearing, target_elev_m=950.0, search_radius_m=5.0)
    assert abs(r - expected_rc[0]) <= 6 and abs(c - expected_rc[1]) <= 6
    assert abs(h[r, c] - 950.0) <= 6.0


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
