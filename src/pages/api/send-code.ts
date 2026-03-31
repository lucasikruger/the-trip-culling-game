import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { generateCode } from '../../lib/auth';
import { sendLoginCode } from '../../lib/email';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = (form.get('email') as string)?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/login?error=missing_email', 302);
  }

  // Check participant exists
  const { data: participant } = await supabase
    .from('participants')
    .select('email, is_active')
    .eq('email', email)
    .single();

  if (!participant?.is_active) {
    return redirect('/login?error=not_invited', 302);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await supabase
    .from('participants')
    .update({ login_code: code, code_expires_at: expiresAt })
    .eq('email', email);

  // Always log the code so it's accessible even if email delivery fails
  console.log(`[login-code] ${email} → ${code}`);

  try {
    await sendLoginCode(email, code);
  } catch (err) {
    console.error('[send-code] email error:', err);
    // Don't block login — code is visible in server logs
  }

  return redirect(`/login?step=code&email=${encodeURIComponent(email)}`, 302);
};
