import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { sendPhaseUpdateNotification } from '../../../lib/email';
import { getDrawDurationMinutes } from '../../../lib/stage';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const { data: settings } = await supabase.from('settings').select('draw_duration_hours, draw_duration_minutes').single();
  const form = await request.formData();
  const configuredDrawMinutes = getDrawDurationMinutes(settings);
  const drawMinutes = Math.max(1, Number(form.get('draw_minutes') ?? configuredDrawMinutes));
  const destinationIds = form.getAll('destination_id').map(String).filter(Boolean);

  if (destinationIds.length < 2) return redirect('/admin?error=draw_needs_two', 302);

  const drawDeadline = new Date(Date.now() + drawMinutes * 60 * 1000).toISOString();

  const { error: settingsErr } = await supabase
    .from('settings')
    .update({ draw_deadline: drawDeadline })
    .eq('id', 1);

  if (settingsErr) {
    console.error('[request-start-draw] settings error:', settingsErr);
    return redirect('/admin?error=db_error', 302);
  }

  const { error: markErr } = await supabase
    .from('destinations')
    .update({ is_in_draw: true })
    .in('id', destinationIds);

  if (markErr) {
    console.error('[request-start-draw] mark error:', markErr);
    return redirect('/admin?error=db_error', 302);
  }

  await supabase
    .from('destinations')
    .update({ is_in_draw: false })
    .not('id', 'in', `(${destinationIds.map((id) => `'${id}'`).join(',')})`);

  await supabase
    .from('votes')
    .delete()
    .in('destination_id', destinationIds);

  const gameUrl = new URL('/', request.url).toString();
  const { data: activeParticipants } = await supabase
    .from('participants')
    .select('email, email_notifications_enabled')
    .eq('is_active', true);

  await Promise.allSettled(
    (activeParticipants ?? [])
      .filter((participant) => participant.email_notifications_enabled !== false)
      .map((participant) => sendPhaseUpdateNotification(participant.email, {
        stage: 'draw',
        gameUrl,
      })),
  );

  return redirect('/admin?success=draw_started', 302);
};
