import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { sendRemovalNotification } from '../../../lib/email';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const form          = await request.formData();
  const destinationId = (form.get('destination_id') as string)?.trim();
  const reason        = (form.get('reason')         as string)?.trim();

  if (!destinationId || !reason) {
    return redirect('/admin?error=missing_fields', 302);
  }

  // Fetch destination to get creator info
  const { data: dest } = await supabase
    .from('destinations')
    .select('name, created_by, is_removed')
    .eq('id', destinationId)
    .single();

  if (!dest || dest.is_removed) {
    return redirect('/admin?error=not_found', 302);
  }

  // Mark as removed
  await supabase.from('destinations').update({
    is_removed:     true,
    removal_reason: reason,
    removed_at:     new Date().toISOString(),
    removed_by:     user.email,
  }).eq('id', destinationId);

  // Delete votes so the voter can vote again
  await supabase.from('votes').delete().eq('destination_id', destinationId);

  // Notify creator (don't block on email errors)
  try {
    if (dest.created_by) {
      const { data: creator } = await supabase
        .from('participants')
        .select('email_notifications_enabled')
        .eq('email', dest.created_by)
        .maybeSingle();

      if (creator?.email_notifications_enabled !== false) {
        await sendRemovalNotification(dest.created_by, dest.name, reason);
      }
    }
  } catch (err) {
    console.error('[remove-destination] email error:', err);
  }

  return redirect('/admin?success=removed', 302);
};
