import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const form = await request.formData();
  const email = (form.get('email') as string)?.trim().toLowerCase();
  const action = (form.get('action') as string)?.trim();

  if (!email || !action) {
    return redirect('/admin?error=missing_fields', 302);
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('email, is_super_admin, email_notifications_enabled')
    .eq('email', email)
    .maybeSingle();

  const targetIsSuperAdmin = Boolean(participant?.is_super_admin);

  if (action === 'remove') {
    if (email === user.email) {
      return redirect('/admin?error=cannot_remove_self', 302);
    }
    if (targetIsSuperAdmin) {
      return redirect('/admin?error=cannot_change_game_master', 302);
    }

    const { error } = await supabase
      .from('participants')
      .update({
        is_active: false,
        is_admin: false,
        login_code: null,
        code_expires_at: null,
        session_token: null,
        session_expires_at: null,
      })
      .eq('email', email);

    if (error) {
      console.error('[toggle-participant] remove error:', error);
      return redirect('/admin?error=db_error', 302);
    }

    return redirect('/admin?success=participant_removed', 302);
  }

  if (action === 'restore') {
    const { error } = await supabase
      .from('participants')
      .update({ is_active: true })
      .eq('email', email);

    if (error) {
      console.error('[toggle-participant] restore error:', error);
      return redirect('/admin?error=db_error', 302);
    }

    return redirect('/admin?success=participant_restored', 302);
  }

  if (action === 'grant_admin' || action === 'revoke_admin') {
    if (!user.is_super_admin) {
      return redirect('/admin?error=admin_role_locked', 302);
    }
    if (email === user.email) {
      return redirect('/admin?error=cannot_remove_self', 302);
    }
    if (targetIsSuperAdmin) {
      return redirect('/admin?error=cannot_change_game_master', 302);
    }

    const { error } = await supabase
      .from('participants')
      .update({ is_admin: action === 'grant_admin' })
      .eq('email', email);

    if (error) {
      console.error('[toggle-participant] admin role error:', error);
      return redirect('/admin?error=db_error', 302);
    }

    return redirect(`/admin?success=${action === 'grant_admin' ? 'admin_granted' : 'admin_revoked'}`, 302);
  }

  if (action === 'toggle_emails') {
    const { error } = await supabase
      .from('participants')
      .update({ email_notifications_enabled: !participant?.email_notifications_enabled })
      .eq('email', email);

    if (error) {
      console.error('[toggle-participant] notification toggle error:', error);
      return redirect('/admin?error=db_error', 302);
    }

    return redirect(`/admin?success=${participant?.email_notifications_enabled ? 'participant_emails_disabled' : 'participant_emails_enabled'}`, 302);
  }

  return redirect('/admin?error=missing_fields', 302);
};
