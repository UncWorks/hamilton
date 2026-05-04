import type { NarrationInput, Provider } from '../types';

/** Deterministic-string provider — pure function over the components payload.
 * R14-compliant by construction: bullets reference component values verbatim.
 * This is also the ultimate fallback when LLM providers are unreachable.
 */
export const deterministicProvider: Provider = {
  name: 'deterministic',
  async narrate(input: NarrationInput): Promise<string[]> {
    const { components, source_id } = input;
    const bullets: string[] = [];
    if (components.temporal < 0.7) {
      bullets.push(
        `${source_id} link cadence degraded ` +
          `(temporal score ${components.temporal.toFixed(2)})`,
      );
    }
    if (components.stability < 0.7) {
      bullets.push(
        `${source_id} stability faulting ` +
          `(stability score ${components.stability.toFixed(2)})`,
      );
    }
    if (components.spatial < 0.7) {
      bullets.push(
        components.spatial < 0.45
          ? `Blanket degradation across neighbors`
          : `Localized to ${source_id} corridor; neighbors healthy`,
      );
    }
    if (components.fingerprint < 0.7) {
      bullets.push(
        `Fingerprint match (deterministic overlap ratio ${components.fingerprint.toFixed(2)})`,
      );
    }
    if (bullets.length === 0) {
      bullets.push(`${source_id} nominal across all four detectors`);
    }
    return bullets.slice(0, 3);
  },
};
