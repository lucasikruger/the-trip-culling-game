export const MAX_VOTE_OPTIONS = 5;

export function normalizeVotePointOptions(value: unknown): number[] {
  const options = Array.isArray(value) ? value : [];

  return [...new Set(
    options
      .map(option => Number(option))
      .filter(option => Number.isInteger(option) && option > 0)
  )]
    .sort((a, b) => b - a)
    .slice(0, MAX_VOTE_OPTIONS);
}

export function getActiveVotePoints(value: unknown, destinationCount: number): number[] {
  const normalized = normalizeVotePointOptions(value);
  return normalized.slice(0, Math.min(destinationCount, normalized.length, MAX_VOTE_OPTIONS));
}

export function applyVoteBonus(points: number[], bonusPoints: number): number[] {
  const normalizedBonus = Number.isFinite(bonusPoints) ? Math.max(0, Math.trunc(bonusPoints)) : 0;
  return points.map((point) => point + normalizedBonus);
}
