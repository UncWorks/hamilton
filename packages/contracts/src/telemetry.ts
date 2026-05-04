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

export const TelemetryPayloadSchema = z.object({
  source_id: z.string().min(1),
  inter_arrival_seconds: z.number().nonnegative(),
  crc_error_rate: z.number().min(0).max(1),
  duplicate_rate: z.number().min(0).max(1),
  rf: RfObservationSchema.nullable().optional(),
  degrading: z.boolean().optional().default(false),
}).strict();

export type RfObservation = z.infer<typeof RfObservationSchema>;
export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;
