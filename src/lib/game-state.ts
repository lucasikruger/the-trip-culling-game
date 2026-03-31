import { supabase } from './supabase';
import { sendPhaseUpdateNotification } from './email';
import { getDrawDurationMinutes, getStage, type Settings, type Stage } from './stage';

interface ReconcileOptions {
  gameUrl?: string;
}

interface ReconcileResult {
  settings: Settings | null;
  stage: Stage;
  autoStartedDraw: boolean;
}

export async function reconcileGameState(options: ReconcileOptions = {}): Promise<ReconcileResult> {
  const { data: initialSettings, error: settingsError } = await supabase
    .from('settings')
    .select('*')
    .single();

  if (settingsError || !initialSettings) {
    if (settingsError) {
      console.error('[reconcile-game-state] settings error:', settingsError);
    }
    return {
      settings: null,
      stage: 'submission',
      autoStartedDraw: false,
    };
  }

  const initialStage = getStage(initialSettings);
  if (initialStage !== 'decided') {
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const now = new Date();
  const votingDeadline = initialSettings.voting_deadline ? new Date(initialSettings.voting_deadline) : null;
  if (!votingDeadline || Number.isNaN(votingDeadline.getTime()) || now < votingDeadline) {
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  let destinationsQuery = supabase
    .from('destinations')
    .select('id')
    .eq('is_removed', false)
    .eq('is_example', false);

  if (initialSettings.draw_deadline) {
    destinationsQuery = destinationsQuery.eq('is_in_draw', true);
  }

  const { data: activeDestinations, error: destinationsError } = await destinationsQuery;
  if (destinationsError) {
    console.error('[reconcile-game-state] destinations error:', destinationsError);
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const destinationIds = (activeDestinations ?? []).map((destination) => destination.id);
  if (destinationIds.length < 2) {
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const { data: votes, error: votesError } = await supabase
    .from('votes')
    .select('destination_id, points')
    .in('destination_id', destinationIds);

  if (votesError) {
    console.error('[reconcile-game-state] votes error:', votesError);
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const totals = new Map<string, number>();
  destinationIds.forEach((destinationId) => totals.set(destinationId, 0));
  (votes ?? []).forEach((vote) => {
    totals.set(vote.destination_id, (totals.get(vote.destination_id) ?? 0) + vote.points);
  });

  const maxPoints = Math.max(...Array.from(totals.values()));
  if (maxPoints <= 0) {
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const tiedDestinationIds = destinationIds.filter((destinationId) => (totals.get(destinationId) ?? 0) === maxPoints);
  if (tiedDestinationIds.length < 2) {
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const drawMinutes = getDrawDurationMinutes(initialSettings);
  const drawDeadline = new Date(Date.now() + drawMinutes * 60 * 1000).toISOString();

  const { error: updateSettingsError } = await supabase
    .from('settings')
    .update({ draw_deadline: drawDeadline })
    .eq('id', 1);

  if (updateSettingsError) {
    console.error('[reconcile-game-state] draw settings error:', updateSettingsError);
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const { error: clearDrawFlagsError } = await supabase
    .from('destinations')
    .update({ is_in_draw: false })
    .eq('is_removed', false)
    .eq('is_example', false);

  if (clearDrawFlagsError) {
    console.error('[reconcile-game-state] clear draw flags error:', clearDrawFlagsError);
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const { error: setDrawFlagsError } = await supabase
    .from('destinations')
    .update({ is_in_draw: true })
    .in('id', tiedDestinationIds);

  if (setDrawFlagsError) {
    console.error('[reconcile-game-state] set draw flags error:', setDrawFlagsError);
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const { error: deleteVotesError } = await supabase
    .from('votes')
    .delete()
    .neq('participant_email', '');

  if (deleteVotesError) {
    console.error('[reconcile-game-state] delete votes error:', deleteVotesError);
    return {
      settings: initialSettings,
      stage: initialStage,
      autoStartedDraw: false,
    };
  }

  const { data: updatedSettings, error: updatedSettingsError } = await supabase
    .from('settings')
    .select('*')
    .single();

  if (updatedSettingsError || !updatedSettings) {
    if (updatedSettingsError) {
      console.error('[reconcile-game-state] updated settings error:', updatedSettingsError);
    }
    return {
      settings: initialSettings,
      stage: 'draw',
      autoStartedDraw: true,
    };
  }

  if (options.gameUrl) {
    const { data: activeParticipants, error: participantsError } = await supabase
      .from('participants')
      .select('email, email_notifications_enabled')
      .eq('is_active', true);

    if (participantsError) {
      console.error('[reconcile-game-state] participants error:', participantsError);
    } else {
      await Promise.allSettled(
        (activeParticipants ?? [])
          .filter((participant) => participant.email_notifications_enabled !== false)
          .map((participant) => sendPhaseUpdateNotification(participant.email, {
            stage: 'draw',
            gameUrl: options.gameUrl as string,
          })),
      );
    }
  }

  return {
    settings: updatedSettings,
    stage: getStage(updatedSettings),
    autoStartedDraw: true,
  };
}
