export enum PuzzleRating {
  UNRATED = 0,
  ONE_STAR = 1,
  TWO_STAR = 2,
  THREE_STAR = 3,
  FOUR_STAR = 4,
  FIVE_STAR = 5,
  SIX_STAR = 6,
}

export interface PuzzleRatingDetails {
  bestNB: number;
  diff: number;
  isAdjustment: boolean;
  hasBurn: boolean;
  hasTuckOrSpin: boolean;
}
