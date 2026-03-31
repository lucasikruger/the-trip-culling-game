import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const form = await request.formData();
  const destinationId = (form.get('destination_id') as string)?.trim();
  if (!destinationId) return redirect('/admin?error=missing_fields', 302);

  const { data: destination } = await supabase
    .from('destinations')
    .select('id, created_by, is_example')
    .eq('id', destinationId)
    .single();

  if (!destination || destination.is_example || !destination.created_by) {
    return redirect('/admin?error=not_found', 302);
  }

  cookies.set('revealed_creator_id', destinationId, {
    httpOnly: true,
    path: '/admin',
    maxAge: 5 * 60,
    sameSite: 'lax',
  });

  return redirect('/admin?success=creator_revealed', 302);
};
