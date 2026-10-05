import { z } from 'zod';

export const DetectionKindSchema = z.enum([
  'temporal_anomaly',
  'stability',
  'spatial',
  'fingerprint',
  'modal_gated',
  'modal_selection',
  'recovery',
  /** Jammer AoE estimate opened / updated / stale / retired (HS-24). */
  'emitter_estimate',
]);
export type DetectionKind = z.infer<typeof DetectionKindSchema>;

export const DetectionEventSchema = z.object({
  source_id: z.string().min(1),
  kind: DetectionKindSchema,
  message: z.string(),
  values: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  timestamp: z.string().datetime(),
});

export type DetectionEvent = z.infer<typeof DetectionEventSchema>;
