import { z } from 'zod';

export const AffiliationSchema = z.enum(['friendly', 'enemy', 'neutral', 'unknown']);
export type Affiliation = z.infer<typeof AffiliationSchema>;

export const SensorTypeSchema = z.enum([
  'recon_static',
  'recon_mobile',
  'detection',
  'defense',
  'offense',
]);
export type SensorType = z.infer<typeof SensorTypeSchema>;

export const sensorTypeSides: Record<SensorType, number> = {
  recon_static: 6,
  recon_mobile: 7,
  detection: 5,
  defense: 4,
  offense: 3,
};
