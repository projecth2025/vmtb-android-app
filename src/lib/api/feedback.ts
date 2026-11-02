import { supabase } from '../supabase';

export async function submitFeedback(userId: string, type: string, content: string) {
  const { error } = await supabase
    .from('feedback')
    .insert({ user_id: userId, content: `[${type}] ${content.trim()}` });
  if (error) throw error;
}
