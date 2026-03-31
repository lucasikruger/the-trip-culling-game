import { defineMiddleware } from 'astro:middleware';
import { supabase } from './lib/supabase';

export const onRequest = defineMiddleware(async ({ cookies, locals }, next) => {
  const token = cookies.get('session')?.value;

  if (token) {
    const { data } = await supabase
      .from('participants')
      .select('email, is_admin, is_super_admin, is_active, session_expires_at, display_name, avatar_url')
      .eq('session_token', token)
      .single();

    if (data?.is_active && data?.session_expires_at && new Date(data.session_expires_at) > new Date()) {
      locals.user = {
        email: data.email,
        is_admin: data.is_admin,
        is_super_admin: data.is_super_admin,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
      };
    } else {
      locals.user = null;
    }
  } else {
    locals.user = null;
  }

  return next();
});
