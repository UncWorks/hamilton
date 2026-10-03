import { z } from 'zod';

/**
 * Fire mission (call for fire) — FM 1-02 p. 1-26 (call for fire), p. 1-79
 * (fire mission). Published on `fires/mission/{mission_id}` (retained).
 *
 * Hamilton does NOT own fires execution: it evaluates the mission against the
 * target selection standards (TSS) with live link reliability and report age,
 * and RECOMMENDS a method of control to the FDC. It never issues a fire
 * command. See docs/plans/tss-mission-row.md.
 *
 * TS only — the trust engine does not consume missions (TSS is evaluated in the
 * web client), so there is no contracts-rs mirror. Python mirror:
 * services/comms-sim/src/comms_sim/missions.py.
 */

/** TSS munition class — the key of the TSS / attack-guidance threshold table. */
export const MunitionClassSchema = z.enum(['gps_guided', 'laser_guided', 'unguided']);
export type MunitionClass = z.infer<typeof MunitionClassSchema>;

export const MunitionSchema = z.object({
  /** e.g. "M982", "M795". */
  designation: z.string().min(1),
  /** e.g. "Excalibur", "HE". */
  name: z.string().min(1),
  class: MunitionClassSchema,
});
export type Munition = z.infer<typeof MunitionSchema>;

/** Role a source plays in the mission (assessment §3 Alt A trigger (i)). */
export const DependencyRoleSchema = z.enum([
  'observer_link',
  'target_location',
  'firing_unit_nav',
]);
export type DependencyRole = z.infer<typeof DependencyRoleSchema>;

export const MissionDependencySchema = z.object({
  /** A rated source (`integrity/trust/{source_id}`). */
  source_id: z.string().min(1),
  role: DependencyRoleSchema,
});
export type MissionDependency = z.infer<typeof MissionDependencySchema>;

/**
 * Lifecycle of the mission as the fires system reports it. Hamilton reads it,
 * it does not drive it (`firing` only changes the recommendation text: a
 * collapse mid-mission recommends CHECK FIRING / CEASE LOADING to the FDC).
 */
export const FireMissionStatusSchema = z.enum([
  'received',
  'processing',
  'firing',
  'end_of_mission',
  'cancelled',
]);
export type FireMissionStatus = z.infer<typeof FireMissionStatusSchema>;

/** Method of control requested in the call for fire (FM 6-30 Ch 4). */
export const MethodOfControlSchema = z.enum(['when_ready', 'at_my_command', 'do_not_load']);
export type MethodOfControl = z.infer<typeof MethodOfControlSchema>;

/** HPT = high-payoff target (FM 1-02 p. 1-93); eligible for the commander-approved exception row. */
export const TargetClassSchema = z.enum(['standard', 'hpt']);
export type TargetClass = z.infer<typeof TargetClassSchema>;

export const FireMissionSchema = z.object({
  /** Target number, two letters + four digits, e.g. "AB1001". */
  mission_id: z.string().regex(/^[A-Z]{2}\d{4}$/),
  observer: z.object({
    source_id: z.string().min(1),
    /** Display call sign, e.g. "OBS B (FO)". */
    label: z.string().min(1),
  }),
  target: z.object({
    /** MGRS grid, e.g. "37U DP 08604 33757". */
    grid: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    description: z.string(),
    class: TargetClassSchema,
  }),
  munition: MunitionSchema,
  firing_unit: z.object({
    unit_id: z.string().min(1),
    label: z.string().min(1),
  }),
  /** Every source the mission depends on: observer link, target-location source, firing-unit nav/GPS link. */
  dependencies: z.array(MissionDependencySchema).min(1),
  status: FireMissionStatusSchema,
  method_of_control: MethodOfControlSchema,
  /** When the call for fire was received (ISO 8601 UTC). */
  received_at: z.string().datetime(),
});
export type FireMission = z.infer<typeof FireMissionSchema>;
