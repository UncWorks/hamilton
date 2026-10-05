// Zod side of the AoE contract round-trips (plan jammer-aoe.md §5.3; mirrors the
// Rust tests in packages/contracts-rs/src/lib.rs). Runs against the built dist/,
// so `pnpm --filter @hamilton/contracts test` builds first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DetectionKindSchema,
  EMITTER_ESTIMATE_MAX_BYTES,
  EmitterEstimatePayloadSchema,
  TOPIC_EMITTER_ESTIMATE,
  TelemetryPayloadSchema,
} from '../dist/index.js';

const DIR = fileURLToPath(new URL('../fixtures/aoe/', import.meta.url));
const read = (name) => readFileSync(DIR + name, 'utf8');
const json = (name) => JSON.parse(read(name));
const ESTIMATES = readdirSync(DIR)
  .filter((f) => f.startsWith('emitter-estimate.') && f.endsWith('.json') && !f.includes('reject'))
  .sort();
const FORBIDDEN = ['mode', 'bearings_used', 'ref_link_km', 'footprint_radius_km', 'area50_km2'];

test('the fixture spine has the four estimate fixtures', () => {
  assert.deepEqual(ESTIMATES, [
    'emitter-estimate.b115.json',
    'emitter-estimate.b150.json',
    'emitter-estimate.b215-stale.json',
    'emitter-estimate.unbounded.json',
  ]);
});

for (const name of ESTIMATES) {
  test(`${name} parses strictly and round-trips unchanged`, () => {
    const raw = json(name);
    const parsed = EmitterEstimatePayloadSchema.parse(raw);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), raw);
  });

  test(`${name} is within the ${EMITTER_ESTIMATE_MAX_BYTES} B wire budget (F7)`, () => {
    const body = JSON.stringify(EmitterEstimatePayloadSchema.parse(json(name)));
    assert.ok(Buffer.byteLength(body) <= EMITTER_ESTIMATE_MAX_BYTES, `${Buffer.byteLength(body)} B`);
    assert.ok(Buffer.byteLength(read(name).trimEnd()) <= EMITTER_ESTIMATE_MAX_BYTES);
  });

  test(`${name}: rings <= 64 vertices, coordinates at 5 dp`, () => {
    const e = json(name);
    const polys = [...e.aoe.flatMap((l) => l.contours.map((c) => c.polygon)), e.emitter.region90];
    for (const mp of polys)
      for (const poly of mp.coordinates)
        for (const ring of poly) {
          assert.ok(ring.length <= 64, `ring of ${ring.length}`);
          for (const [lon, lat] of ring) {
            assert.equal(Math.round(lon * 1e5) / 1e5, lon);
            assert.equal(Math.round(lat * 1e5) / 1e5, lat);
          }
        }
  });

  test(`${name} carries no forbidden key`, () => {
    for (const k of FORBIDDEN) assert.ok(!read(name).includes(`"${k}"`), k);
  });
}

test('K4: emitter-estimate.reject-mode.json (b115 + emitter.mode) is rejected', () => {
  const r = EmitterEstimatePayloadSchema.safeParse(json('emitter-estimate.reject-mode.json'));
  assert.equal(r.success, false);
});

test('K4: every forbidden or unknown field is rejected at its level', () => {
  const base = json('emitter-estimate.b115.json');
  const cases = [
    (e) => (e.bearings_used = 2),
    (e) => (e.emitter.mode = { lat: 48.15, lon: 37.87, ce90_m: 35000 }),
    (e) => (e.emitter.area50_km2 = 277.5),
    (e) => (e.aoe[0].ref_link_km = 5),
    (e) => (e.aoe[0].footprint_radius_km = 13.2),
    (e) => (e.aoe[0].contours[0].extra = 1),
    (e) => (e.evidence[0].superseded = true),
    (e) => (e.model.kind = 'grid+aoa'),
    (e) => (e.schema = 'emitter-estimate/2'),
    (e) => (e.aoe[0].contours[0].p = 0.7),
    (e) => (e.state = 'clear'),
    (e) => (e.emitter.region90.type = 'Polygon'),
  ];
  for (const mutate of cases) {
    const e = structuredClone(base);
    mutate(e);
    assert.equal(EmitterEstimatePayloadSchema.safeParse(e).success, false, mutate.toString());
  }
});

test('telemetry v1 sample (with effective_range_km) still parses', () => {
  for (const t of json('telemetry-v1.sample.json')) {
    const p = TelemetryPayloadSchema.parse(t);
    assert.deepEqual(JSON.parse(JSON.stringify(p)), t);
    assert.equal(p.schema, undefined);
  }
});

test('telemetry v2 samples (one per rx_class) round-trip', () => {
  const classes = new Set();
  for (const t of json('telemetry-v2.sample.json')) {
    const p = TelemetryPayloadSchema.parse(t);
    assert.deepEqual(JSON.parse(JSON.stringify(p)), t);
    assert.equal(p.schema, 'telemetry/2');
    assert.equal(p.rf?.effective_range_km, undefined);
    classes.add(p.rx_class);
  }
  assert.deepEqual([...classes].sort(), ['fpv_link', 'gnss_civil', 'gnss_mil', 'gnss_mil_crpa', 'uhf_comms']);
});

test('telemetry v2 rejects an unknown field, a bad gnss_fix and a bad schema', () => {
  const base = json('telemetry-v2.sample.json')[0];
  for (const mutate of [(t) => (t.degrading = true), (t) => (t.gnss_fix = '1d'), (t) => (t.schema = 'telemetry/3'), (t) => (t.rx_class = 'vhf')]) {
    const t = structuredClone(base);
    mutate(t);
    assert.equal(TelemetryPayloadSchema.safeParse(t).success, false, mutate.toString());
  }
});

test('telemetry-beats.jsonl: every line is a valid telemetry/2 body on its own topic', () => {
  const lines = read('telemetry-beats.jsonl').trimEnd().split('\n');
  assert.ok(lines.length > 0);
  for (const line of lines) {
    const { t, topic, payload } = JSON.parse(line);
    assert.equal(typeof t, 'number');
    const p = TelemetryPayloadSchema.parse(payload);
    assert.equal(topic, `telemetry/${p.source_id}/raw`);
    assert.equal(p.schema, 'telemetry/2');
  }
});

test('topic and detection kind (K4 topic, K6)', () => {
  assert.equal(TOPIC_EMITTER_ESTIMATE, 'integrity/emitter/estimate');
  assert.equal(DetectionKindSchema.parse('emitter_estimate'), 'emitter_estimate');
});
