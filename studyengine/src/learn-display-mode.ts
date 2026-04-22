export type LearnDisplayMode = 'empty' | 'populated';

export interface LearnDisplayModeInput {
  consolidatedCount: number;
  subDeckCount: number;
}

export interface LearnDisplayModeResult {
  mode: LearnDisplayMode;
  showVennTeaching: boolean;
  showInsightsGrid: boolean;
  showHeroCoverageRing: boolean;
  showSubDeckPickerButton: boolean;
  showPickerCaption: boolean;
}

export function deriveLearnDisplayMode(input: LearnDisplayModeInput): LearnDisplayModeResult {
  const mode: LearnDisplayMode = input.consolidatedCount === 0 ? 'empty' : 'populated';
  const multiSubDeck = input.subDeckCount > 1;

  return {
    mode,
    showVennTeaching: mode === 'empty',
    showInsightsGrid: mode === 'populated',
    showHeroCoverageRing: false,
    showSubDeckPickerButton: multiSubDeck,
    showPickerCaption: multiSubDeck,
  };
}
