export const TOPIC_TRUST_PREFIX = 'integrity/trust' as const;
export const TOPIC_FINGERPRINT_CANDIDATES = 'integrity/fingerprint/candidates' as const;
export const TOPIC_NARRATION_PREFIX = 'integrity/narration' as const;
export const TOPIC_TELEMETRY_PREFIX = 'telemetry' as const;

export const trustTopic = (sourceId: string): string =>
  `${TOPIC_TRUST_PREFIX}/${sourceId}`;

export const narrationTopic = (sourceId: string): string =>
  `${TOPIC_NARRATION_PREFIX}/${sourceId}`;

export const telemetryTopic = (sourceId: string): string =>
  `${TOPIC_TELEMETRY_PREFIX}/${sourceId}/raw`;
