import { getSiteUrl } from '../../../lib/site';
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { sendInvitationEmail } from '../../../lib/email';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const form = await request.formData();
  const email = (form.get('email') as string)?.trim().toLowerCase();
  const requestedAdmin = form.get('is_admin') === 'on';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/admin?error=missing_fields', 302);
  }

  const { data: existingParticipant } = await supabase
    .from('participants')
    .select('email, is_active, is_admin, is_super_admin, email_notifications_enabled')
    .eq('email', email)
    .maybeSingle();

  const nextIsAdmin = existingParticipant
    ? (user.is_super_admin ? requestedAdmin || existingParticipant.is_super_admin : existingParticipant.is_admin)
    : (user.is_super_admin && requestedAdmin);

  const { error } = await supabase.from('participants').upsert({
    email,
    is_admin: nextIsAdmin,
    is_super_admin: existingParticipant?.is_super_admin ?? false,
    is_active: true,
    email_notifications_enabled: existingParticipant?.email_notifications_enabled ?? true,
  }, { onConflict: 'email' });

  if (error) {
    console.error('[upsert-participant] error:', error);
    return redirect('/admin?error=db_error', 302);
  }

  const shouldSendInvitation = !existingParticipant || !existingParticipant.is_active;
  if (shouldSendInvitation) {
    try {
      const gameUrl = getSiteUrl() + '/login';
      await sendInvitationEmail(email, {
        gameUrl,
        invitedBy: user.email,
        isAdmin: nextIsAdmin,
      });
    } catch (inviteError) {
      console.error('[upsert-participant] invitation email error:', inviteError);
    }
  }

  return redirect('/admin?success=participant_saved', 302);
};
