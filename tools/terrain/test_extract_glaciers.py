import pytest

osmium = pytest.importorskip("osmium")

from extract_glaciers import extract_glaciers  # noqa: E402

# Lon/lat around (0, 0). Way 1 is a glacier, way 2 is scree, way 3 is a glacier far away.
# Relation 100 is a glacier multipolygon: outer way 10, inner way 20.
OSM = """<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6" generator="test">
  <node id="1" lat="0.000" lon="0.000" version="1"/>
  <node id="2" lat="0.000" lon="0.002" version="1"/>
  <node id="3" lat="0.002" lon="0.002" version="1"/>
  <node id="4" lat="0.002" lon="0.000" version="1"/>
  <node id="5" lat="0.004" lon="0.004" version="1"/>
  <node id="6" lat="0.004" lon="0.005" version="1"/>
  <node id="7" lat="0.005" lon="0.005" version="1"/>
  <node id="31" lat="1.000" lon="1.000" version="1"/>
  <node id="32" lat="1.000" lon="1.002" version="1"/>
  <node id="33" lat="1.002" lon="1.002" version="1"/>
  <node id="11" lat="-0.006" lon="-0.006" version="1"/>
  <node id="12" lat="-0.006" lon="-0.002" version="1"/>
  <node id="13" lat="-0.002" lon="-0.002" version="1"/>
  <node id="14" lat="-0.002" lon="-0.006" version="1"/>
  <node id="21" lat="-0.005" lon="-0.005" version="1"/>
  <node id="22" lat="-0.005" lon="-0.003" version="1"/>
  <node id="23" lat="-0.003" lon="-0.003" version="1"/>
  <node id="24" lat="-0.003" lon="-0.005" version="1"/>
  <way id="1" version="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="natural" v="glacier"/></way>
  <way id="2" version="1"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="5"/><tag k="natural" v="scree"/></way>
  <way id="3" version="1"><nd ref="31"/><nd ref="32"/><nd ref="33"/><nd ref="31"/><tag k="natural" v="glacier"/></way>
  <way id="10" version="1"><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="14"/><nd ref="11"/></way>
  <way id="20" version="1"><nd ref="21"/><nd ref="22"/><nd ref="23"/><nd ref="24"/><nd ref="21"/></way>
  <relation id="100" version="1">
    <member type="way" ref="10" role="outer"/>
    <member type="way" ref="20" role="inner"/>
    <tag k="type" v="multipolygon"/><tag k="natural" v="glacier"/>
  </relation>
</osm>
"""


def test_extracts_glacier_ways_and_multipolygons_inside_the_bounds(tmp_path):
    path = tmp_path / "t.osm"
    path.write_text(OSM)
    features = extract_glaciers(str(path), (-0.01, -0.01, 0.01, 0.01))
    by_id = {f["properties"]["osm"]: f["geometry"]["coordinates"] for f in features}
    assert sorted(by_id) == ["relation/100", "way/1"]
    assert len(by_id["way/1"]) == 1
    assert [0.002, 0.002] in by_id["way/1"][0]
    outer, inner = by_id["relation/100"]
    assert [-0.006, -0.006] in outer
    assert [-0.005, -0.005] in inner
