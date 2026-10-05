import { z } from 'zod';

/**
 * The engine's after-action copy of an FDC branch choice on a fire mission
 * (POST /api/missions/decision). The full record (TSS verdict, J, report
 * age, role / initials, DTG) is the web FDC journal; the engine keeps this
 * subset in its log. Accept-risk (branch [4]) has no engine option yet.
 */
export const BranchOptionSchema = z.enum([
  'delay_60s',
  'shift_non_gps',
  'confirm_alt_channel',
]);
export type BranchOption = z.infer<typeof BranchOptionSchema>;

export const MissionDecisionRequestSchema = z.object({
  /** `<mission_id>/<lead source_id>`, e.g. "AB1001/unit_b". */
  source_id: z.string().min(1),
  option: BranchOptionSchema,
  trust_score_at_selection: z.number().min(0).max(1),
});
export type MissionDecisionRequest = z.infer<typeof MissionDecisionRequestSchema>;
