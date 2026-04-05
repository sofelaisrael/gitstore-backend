import supabase from '../services/supabaseService.js';
export default async function snapshot(req, res) {
  try {
    const { data: repos } = await supabase.from('repos').select('id, stars, forks').eq('is_listed', true);
    if (!repos?.length) return res.json({ message: 'No listed repos' });
    const snapshots = repos.map(repo => ({ repo_id: repo.id, recorded_date: new Date().toISOString().split('T')[0], stars: repo.stars, forks: repo.forks }));
    await supabase.from('repo_history').upsert(snapshots, { onConflict: 'repo_id, recorded_date' });
    await supabase.from('admin_log').insert({ action: 'snapshot', detail: { count: repos.length } });
    res.json({ success: true, count: repos.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
}
