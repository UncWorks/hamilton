import { z } from 'zod';
import { RxClassSchema } from './telemetry.js';

/**
 * `integrity/emitter/estimate` (retained, QoS 1): the engine's jammer
 * area-of-effect estimate. Plan docs/plans/jammer-aoe.md §3.2, System Design
 * §5.4, FRS FR-04b. Mirrors `packages/contracts-rs` `EmitterEstimatePayload`
 * (`deny_unknown_fields`).
 *
 * Every object is `.strict()`. The MVP schema has NO `emitter.mode`,
 * `bearings_used`, `ref_link_km`, `footprint_radius_km` or `area50_km2`
 * (condition K4, HS-20): a payload carrying any of them is rejected. A located
 * emitter (`mode`) arrives only under a new schema, `emitter-estimate/2`.
 *
 * Retire = an EMPTY retained payload on the topic (not a payload with
 * `state: 'retired'`); consumers clear the estimate on an empty message.
 */

export const EMITTER_ESTIMATE_SCHEMA = 'emitter-estimate/1' as const;

/**
 * Wire-size budget (F7): a serialized estimate must stay <= 7168 B, under the
 * broker's 8192 B `message_size_limit` (infra/docker/mosquitto/mosquitto.conf).
 * Coordinates are rounded to 5 dp; rings carry <= 64 vertices.
 */
export const EMITTER_ESTIMATE_MAX_BYTES = 7168;

/** GeoJSON MultiPolygon: polygons → rings (outer first, then holes) → [lon, lat]. */
export const MultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
}).strict();
export type MultiPolygon = z.infer<typeof MultiPolygonSchema>;

export const EstimateStateSchema = z.enum(['active', 'stale', 'unbounded', 'retired']);
export type EstimateState = z.infer<typeof EstimateStateSchema>;

export const EstimateModelSchema = z.object({
  kind: z.literal('set'),
  propagation: z.literal('two_ray'),
  grid_m: z.number(),
  hypotheses: z.object({
    erp_dbm: z.array(z.number()),
    mast_m: z.array(z.number()),
  }).strict(),
  sigma_db: z.number(),
}).strict();
export type EstimateModel = z.infer<typeof EstimateModelSchema>;

export const AoeContourSchema = z.object({
  p: z.union([z.literal(0.5), z.literal(0.9)]),
  polygon: MultiPolygonSchema,
  area_km2: z.number(),
}).strict();
export type AoeContour = z.infer<typeof AoeContourSchema>;

export const AoeLayerSchema = z.object({
  rx_class: RxClassSchema,
  contours: z.array(AoeContourSchema),
  radius_km_range: z.tuple([z.number(), z.number()]),
}).strict();
export type AoeLayer = z.infer<typeof AoeLayerSchema>;

/** The 90% emitter region, as data only (not drawn in the MVP). No `mode` (K4). */
export const EmitterRegionSchema = z.object({
  region90: MultiPolygonSchema,
  area90_km2: z.number(),
  erp_dbm_range: z.tuple([z.number(), z.number()]),
}).strict();
export type EmitterRegion = z.infer<typeof EmitterRegionSchema>;

export const EvidenceStateSchema = z.enum(['degraded', 'healthy']);
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;

export const EvidenceItemSchema = z.object({
  source_id: z.string(),
  state: EvidenceStateSchema,
  rx_class: RxClassSchema,
  age_s: z.number(),
  lat: z.number(),
  lon: z.number(),
}).strict();
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EmitterEstimatePayloadSchema = z.object({
  schema: z.literal(EMITTER_ESTIMATE_SCHEMA),
  /** Stable per episode, e.g. "J1-20240215T184236Z". */
  estimate_id: z.string(),
  state: EstimateStateSchema,
  method_id: z.string(),
  method_match: z.number().min(0).max(1),
  method_ambiguous: z.boolean(),
  model: EstimateModelSchema,
  aoe: z.array(AoeLayerSchema),
  emitter: EmitterRegionSchema,
  evidence: z.array(EvidenceItemSchema),
  evidence_hash: z.string(),
  /** From the input tick time (determinism). */
  computed_at: z.string().datetime(),
  /** computed_at + 20 s (two missed 10 s heartbeats). */
  valid_until: z.string().datetime(),
}).strict();
export type EmitterEstimatePayload = z.infer<typeof EmitterEstimatePayloadSchema>;
