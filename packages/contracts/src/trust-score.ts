import { z } from 'zod';

export const TrustComponentsSchema = z.object({
  temporal: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
  spatial: z.number().min(0).max(1),
  fingerprint: z.number().min(0).max(1),
});

export const TrustScorePayloadSchema = z.object({
  source_id: z.string().min(1),
  score: z.number().min(0).max(1),
  components: TrustComponentsSchema,
  timestamp: z.string().datetime(),
});

export type TrustComponents = z.infer<typeof TrustComponentsSchema>;
export type TrustScorePayload = z.infer<typeof TrustScorePayloadSchema>;
