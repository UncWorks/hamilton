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
  effective_range_km: z.number().nonnegative(),
}).strict();

/**
 * Wire shape on `telemetry/{source_id}/raw`. Mirrors
 * `packages/contracts-rs` `TelemetryPayload` (deny_unknown_fields).
 *
 * `lat`/`lon` (WGS-84 decimal degrees) are required: the spatial
 * discriminator (FR-03) needs real positions. There is no self-reported
 * `degrading` flag; the engine derives degradation from its own detectors.
 */
export const TelemetryPayloadSchema = z.object({
  source_id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  inter_arrival_seconds: z.number().nonnegative(),
  crc_error_rate: z.number().min(0).max(1),
  duplicate_rate: z.number().min(0).max(1),
  rf: RfObservationSchema.nullable().optional(),
}).strict();

export type RfObservation = z.infer<typeof RfObservationSchema>;
export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;
