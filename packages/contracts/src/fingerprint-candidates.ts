import { z } from 'zod';

/**
 * FR-04a candidate. `score` is MATCH STRENGTH (k/6 overlap ratio): higher =
 * more like this jammer. Not a trust value; see TrustComponents.fingerprint.
 */
export const FingerprintCandidateSchema = z.object({
  method_id: z.string().min(1),
  named_systems: z.array(z.string()),
  score: z.number().min(0).max(1),
  munitions_affected: z.array(z.string()),
  source_citation: z.string().min(1),
});

export const FingerprintCandidatesPayloadSchema = z.object({
  source_id: z.string().min(1),
  candidates: z.array(FingerprintCandidateSchema).length(3),
  timestamp: z.string().datetime(),
});

export type FingerprintCandidate = z.infer<typeof FingerprintCandidateSchema>;
export type FingerprintCandidatesPayload = z.infer<
  typeof FingerprintCandidatesPayloadSchema
>;
