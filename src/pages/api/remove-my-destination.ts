import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/login', 302);

  const form          = await request.formData();
  const destinationId = (form.get('destination_id') as string)?.trim();

  if (!destinationId) return redirect('/submit?error=missing_fields', 302);

  // Must be the creator
  const { data: dest } = await supabase
    .from('destinations')
    .select('id, created_by, is_removed')
    .eq('id', destinationId)
    .single();

  if (!dest || dest.is_removed) return redirect('/submit?error=not_found', 302);
  if (dest.created_by !== user.email) return redirect('/submit?error=forbidden', 302);

  await supabase.from('destinations').update({
    is_removed:     true,
    removal_reason: 'Removed by creator',
    removed_at:     new Date().toISOString(),
    removed_by:     user.email,
  }).eq('id', destinationId);

  // Clear votes so affected voters can vote again
  await supabase.from('votes').delete().eq('destination_id', destinationId);

  return redirect('/submit?success=removed', 302);
};
