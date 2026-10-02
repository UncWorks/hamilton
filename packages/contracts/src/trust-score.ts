import { z } from 'zod';

/**
 * Per-detector trust components (FR-05). Every component is a TRUST value in
 * [0, 1]: 1 = healthy, 0 = bad.
 *
 * `fingerprint` = 1 − match_strength of the best library match (≥ 0.5
 * threshold), or 1 when nothing matches. It is the inverse of the FR-04a
 * candidate `score`, which is match strength.
 */
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
