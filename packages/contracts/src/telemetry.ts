import { z } from 'zod';

export const TimeDomainPatternSchema = z.enum([
  'continuous',
  'pulsed',
  'barrage',
  'swept',
]);
export type TimeDomainPattern = z.infer<typeof TimeDomainPatternSchema>;

export const RfObservationSchema = z.object({
  frequency_band_mhz: z.tuple([z.number(), z.number()]),
  hop_spread_hz: z.number().nonnegative(),
  gps_l1_overlap: z.boolean(),
  gps_l2_overlap: z.boolean(),
  time_domain_pattern: TimeDomainPatternSchema,
  /**
   * @deprecated Optional since telemetry/2 (FRS FR-04 rev): an emitter's range
   * is not observable by a friendly receiver. The simulator no longer sends it;
   * v1 payloads that carry it still parse.
   */
  effective_range_km: z.number().nonnegative().optional(),
}).strict();

/**
 * Receiver class of a reporting unit (plan jammer-aoe.md §3.1). The AoE MVP
 * estimates and publishes `gnss_civil` and `gnss_mil` only; the other classes
 * are reserved so v2 layers do not need an enum change.
 */
export const RxClassSchema = z.enum([
  'gnss_civil',
  'gnss_mil',
  'gnss_mil_crpa',
  'uhf_comms',
  'fpv_link',
]);
export type RxClass = z.infer<typeof RxClassSchema>;

/**
 * GNSS fix state reported by the unit. GNSS-class AoE evidence (condition K2):
 * `'3d'` = healthy; `'2d'` or `'none'` = degraded. Never derived from the
 * FR-01 / FR-02 link verdict.
 */
export const GnssFixSchema = z.enum(['3d', '2d', 'none']);
export type GnssFix = z.infer<typeof GnssFixSchema>;

export const TELEMETRY_SCHEMA_V2 = 'telemetry/2' as const;

/**
 * Wire shape on `telemetry/{source_id}/raw`. Mirrors
 * `packages/contracts-rs` `TelemetryPayload` (deny_unknown_fields).
 *
 * `lat`/`lon` (WGS-84 decimal degrees) are required: the spatial
 * discriminator (FR-03) needs real positions. There is no self-reported
 * `degrading` flag; the engine derives degradation from its own detectors.
 *
 * telemetry/2 (plan jammer-aoe.md §3.1) adds three optional fields: `schema`
 * (absent = v1), `rx_class` and `gnss_fix`. v1 payloads still parse.
 */
export const TelemetryPayloadSchema = z.object({
  schema: z.literal(TELEMETRY_SCHEMA_V2).optional(),
  source_id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  inter_arrival_seconds: z.number().nonnegative(),
  crc_error_rate: z.number().min(0).max(1),
  duplicate_rate: z.number().min(0).max(1),
  rx_class: RxClassSchema.optional(),
  gnss_fix: GnssFixSchema.optional(),
  rf: RfObservationSchema.nullable().optional(),
}).strict();

export type RfObservation = z.infer<typeof RfObservationSchema>;
export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;
