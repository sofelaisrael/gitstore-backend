import supabase from '../services/supabaseService.js';
export default async function cleanup(req, res) {
  try {
    await supabase.from('search_cache').delete().lt('expires_at', new Date().toISOString());
    await supabase.from('repos').update({ is_listed: false }).lt('last_pushed_at', new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()).lt('stars', 50);
    await supabase.from('repo_history').delete().lt('recorded_date', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    await supabase.from('admin_log').insert({ action: 'cleanup', detail: { cleaned: true } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
}
