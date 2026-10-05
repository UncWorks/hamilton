'use client';

import { useEffect } from 'react';
import { startMqtt } from '@/lib/mqtt-client';
import { useHamilton } from '@/store/hamilton';

const FALLBACK_URL = 'ws://localhost:9001';

/**
 * Wires the live MQTT subscription to the Zustand store.
 * Mounts once at the page root.
 */
export function useHamiltonMqtt(): void {
  const applyScore = useHamilton((s) => s.applyScore);
  const setCandidates = useHamilton((s) => s.setCandidates);
  const setTraceBullets = useHamilton((s) => s.setTraceBullets);
  const setLlmStatus = useHamilton((s) => s.setLlmStatus);
  const upsertMission = useHamilton((s) => s.upsertMission);
  const removeMission = useHamilton((s) => s.removeMission);
  const receiveEmitterEstimate = useHamilton((s) => s.receiveEmitterEstimate);
  const clearEmitterEstimate = useHamilton((s) => s.clearEmitterEstimate);
  const tickEmitterEstimate = useHamilton((s) => s.tickEmitterEstimate);

  // The C2 marks an unrefreshed estimate stale on its own clock (HS-25).
  useEffect(() => {
    const id = window.setInterval(() => tickEmitterEstimate(), 1000);
    return () => window.clearInterval(id);
  }, [tickEmitterEstimate]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_MQTT_WS_URL ?? FALLBACK_URL;
    const handle = startMqtt(url, {
      onTrust: applyScore,
      onCandidates: (p) => setCandidates(p.source_id, p.candidates),
      onNarration: (p) => {
        setTraceBullets(p.source_id, p.bullets);
        setLlmStatus(p.provider === 'deterministic' ? 'fallback' : 'active');
      },
      onMission: upsertMission,
      onMissionRemoved: removeMission,
      onEmitterEstimate: (p) => receiveEmitterEstimate(p),
      onEmitterEstimateCleared: () => clearEmitterEstimate(),
      onConnectionChange: (connected) => {
        if (!connected) setLlmStatus('unreachable');
      },
    });
    return () => handle.disconnect();
  }, [applyScore, setCandidates, setTraceBullets, setLlmStatus, upsertMission, removeMission, receiveEmitterEstimate, clearEmitterEstimate]);
}
