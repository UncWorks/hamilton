import type { TrustComponents, TrustScorePayload } from '@hamilton/contracts';

export type ProviderName = 'claude' | 'local' | 'deterministic';

export interface NarrationInput {
  source_id: string;
  components: TrustComponents;
  score: number;
  context: TrustScorePayload;
}

export interface NarrationOutput {
  source_id: string;
  bullets: string[];
  provider: ProviderName;
}

export interface Provider {
  readonly name: ProviderName;
  narrate(input: NarrationInput, signal: AbortSignal): Promise<string[]>;
}
