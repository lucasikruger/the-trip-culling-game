import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { generateSessionToken } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = (form.get('email') as string)?.trim().toLowerCase();
  const code  = (form.get('code')  as string)?.trim();

  if (!email || !code) {
    return redirect(`/login?step=code&email=${encodeURIComponent(email)}&error=missing_fields`, 302);
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('login_code, code_expires_at, is_active')
    .eq('email', email)
    .single();

  if (!participant?.is_active || participant.login_code !== code) {
    return redirect(`/login?step=code&email=${encodeURIComponent(email)}&error=invalid_code`, 302);
  }

  if (!participant.code_expires_at || new Date(participant.code_expires_at) < new Date()) {
    return redirect(`/login?step=code&email=${encodeURIComponent(email)}&error=expired_code`, 302);
  }

  const sessionToken   = generateSessionToken();
  const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('participants')
    .update({
      session_token:      sessionToken,
      session_expires_at: sessionExpires,
      login_code:         null,
      code_expires_at:    null,
    })
    .eq('email', email);

  cookies.set('session', sessionToken, {
    httpOnly: true,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    sameSite: 'lax',
  });

  return redirect('/', 302);
};
