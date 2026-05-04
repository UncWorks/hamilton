import { z } from 'zod';

export const ModalOptionSchema = z.enum([
  'delay_60s',
  'shift_non_gps',
  'confirm_alt_channel',
]);
export type ModalOption = z.infer<typeof ModalOptionSchema>;

export const ModalSelectionRequestSchema = z.object({
  source_id: z.string().min(1),
  option: ModalOptionSchema,
  trust_score_at_selection: z.number().min(0).max(1),
});
export type ModalSelectionRequest = z.infer<typeof ModalSelectionRequestSchema>;
