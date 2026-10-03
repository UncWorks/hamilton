'use client';

import mqtt, { type MqttClient } from 'mqtt';
import {
  FireMissionSchema,
  FingerprintCandidatesPayloadSchema,
  TOPIC_FIRE_MISSION_PREFIX,
  TOPIC_FINGERPRINT_CANDIDATES,
  TOPIC_NARRATION_PREFIX,
  TOPIC_TRUST_PREFIX,
  TrustScorePayloadSchema,
  type FingerprintCandidatesPayload,
  type FireMission,
  type TrustScorePayload,
} from '@hamilton/contracts';
import { z } from 'zod';

const NarrationSchema = z.object({
  source_id: z.string(),
  bullets: z.array(z.string()).max(3),
  provider: z.enum(['claude', 'local', 'deterministic']),
});

export type Narration = z.infer<typeof NarrationSchema>;

export interface MqttBindings {
  onTrust: (p: TrustScorePayload) => void;
  onCandidates: (p: FingerprintCandidatesPayload) => void;
  onNarration: (p: Narration) => void;
  /** Call for fire on `fires/mission/{id}` (retained). */
  onMission?: (m: FireMission) => void;
  /** Empty retained payload on `fires/mission/{id}`: the mission is closed. */
  onMissionRemoved?: (mission_id: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface MqttClientHandle {
  disconnect: () => void;
}

const TRUST_TOPIC_GLOB = `${TOPIC_TRUST_PREFIX}/+`;
const NARRATION_TOPIC_GLOB = `${TOPIC_NARRATION_PREFIX}/+`;
const MISSION_TOPIC_GLOB = `${TOPIC_FIRE_MISSION_PREFIX}/+`;

export function startMqtt(url: string, bindings: MqttBindings): MqttClientHandle {
  const client: MqttClient = mqtt.connect(url, {
    clientId: `hamilton-web-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 1000,
    keepalive: 30,
    clean: true,
  });

  client.on('connect', () => {
    bindings.onConnectionChange?.(true);
    client.subscribe([TRUST_TOPIC_GLOB, TOPIC_FINGERPRINT_CANDIDATES, NARRATION_TOPIC_GLOB, MISSION_TOPIC_GLOB]);
  });

  client.on('reconnect', () => bindings.onConnectionChange?.(false));
  client.on('close', () => bindings.onConnectionChange?.(false));

  client.on('message', (topic, payload) => {
    if (topic.startsWith(`${TOPIC_FIRE_MISSION_PREFIX}/`)) {
      const missionId = topic.slice(TOPIC_FIRE_MISSION_PREFIX.length + 1);
      if (payload.length === 0) {
        bindings.onMissionRemoved?.(missionId);
        return;
      }
      try {
        const parsed = FireMissionSchema.safeParse(JSON.parse(payload.toString()));
        if (parsed.success) bindings.onMission?.(parsed.data);
      } catch {
        /* malformed call for fire — ignore */
      }
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (topic.startsWith(`${TOPIC_TRUST_PREFIX}/`)) {
      const parsed = TrustScorePayloadSchema.safeParse(json);
      if (parsed.success) bindings.onTrust(parsed.data);
      return;
    }
    if (topic === TOPIC_FINGERPRINT_CANDIDATES) {
      const parsed = FingerprintCandidatesPayloadSchema.safeParse(json);
      if (parsed.success) bindings.onCandidates(parsed.data);
      return;
    }
    if (topic.startsWith(`${TOPIC_NARRATION_PREFIX}/`)) {
      const parsed = NarrationSchema.safeParse(json);
      if (parsed.success) bindings.onNarration(parsed.data);
    }
  });

  return {
    disconnect: () => {
      client.end(true);
    },
  };
}
