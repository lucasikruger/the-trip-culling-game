export type Stage = 'submission' | 'voting' | 'draw' | 'decided';

export interface Settings {
  id: number;
  submission_deadline: string | null;
  voting_deadline: string | null;
  draw_deadline: string | null;
  draw_duration_hours: number;
  draw_duration_minutes?: number | null;
  vote_point_options: number[];
  bonus_profile_photo_enabled: boolean;
  bonus_profile_photo_points: number;
  bonus_submission_enabled: boolean;
  bonus_submission_points: number;
}

export function getStage(settings: Settings | null): Stage {
  if (!settings) return 'submission';
  const now  = new Date();
  const sub  = settings.submission_deadline ? new Date(settings.submission_deadline) : null;
  const vote = settings.voting_deadline     ? new Date(settings.voting_deadline)     : null;
  const draw = settings.draw_deadline       ? new Date(settings.draw_deadline)       : null;
  if (!sub  || now < sub)  return 'submission';
  if (!vote || now < vote) return 'voting';
  if (draw  && now < draw) return 'draw';
  return 'decided';
}

export function getDrawDurationMinutes(settings: Settings | null): number {
  if (!settings) return 24 * 60;
  const explicitMinutes = Number(settings.draw_duration_minutes ?? 0);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return Math.max(1, Math.trunc(explicitMinutes));
  }

  const fallbackHours = Number(settings.draw_duration_hours ?? 24);
  if (Number.isFinite(fallbackHours) && fallbackHours > 0) {
    return Math.max(1, Math.trunc(fallbackHours * 60));
  }

  return 24 * 60;
}

export function splitDurationMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const normalized = Math.max(1, Math.trunc(totalMinutes));
  return {
    hours: Math.floor(normalized / 60),
    minutes: normalized % 60,
  };
}

export const STAGE_INFO = {
  submission: {
    label:       'SUBMISSION PHASE',
    description: 'Propose your dream destination! Each traveler submits one unique destination with a photo and description. Make it count.',
    color:       '#39ff14',
    icon:        '✈',
  },
  voting: {
    label:       'VOTING PHASE',
    description: 'Destinations are locked in. Vote for your favorite with your power points — 10, 50, or 100. One vote per traveler. Choose wisely.',
    color:       '#00d4ff',
    icon:        '🗳',
  },
  draw: {
    label:       'DRAW PHASE',
    description: "It's a tie! A select group of destinations goes head to head again. Vote once more — may the best destination win.",
    color:       '#ff9800',
    icon:        '⚔',
  },
  decided: {
    label:       'WINNER DECIDED',
    description: 'The culling is complete. The points have spoken. Pack your bags.',
    color:       '#ffd700',
    icon:        '🏆',
  },
} as const;

/** Format a date for a datetime-local input (YYYY-MM-DDTHH:MM) */
export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}
