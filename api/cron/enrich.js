import supabase from '../services/supabaseService.js';
import { enrichRepo } from '../pipeline/enrichment.js';
import GitHubService from '../services/githubService.js';
export default async function enrich(req, res) {
  try {
    const hasBudget = await GitHubService.hasBudget(200);
    if (!hasBudget) return res.json({ skipped: true, reason: 'Low budget' });
    const { data: queueItems } = await supabase.from('repo_queue').select('*').eq('status', 'pending').order('priority', { ascending: true }).order('queued_at', { ascending: true }).limit(20);
    if (!queueItems?.length) return res.json({ message: 'Empty' });
    let done = 0, failed = 0, skipped = 0;
    for (const item of queueItems) {
      try {
        await supabase.from('repo_queue').update({ status: 'processing' }).eq('id', item.id);
        const result = await enrichRepo(item.full_name);
        if (result.status === 'success') { await supabase.from('repo_queue').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', item.id); done++; }
        else if (result.status === 'skipped') { await supabase.from('repo_queue').update({ status: 'done', processed_at: new Date().toISOString(), error: `Skipped: ${result.reason}` }).eq('id', item.id); skipped++; }
      } catch (e) {
        const attempts = (item.attempts || 0) + 1;
        await supabase.from('repo_queue').update({ status: attempts >= 3 ? 'dead' : 'failed', attempts, error: e.message }).eq('id', item.id);
        failed++;
      }
    }
    await supabase.from('admin_log').insert({ action: 'enrich', detail: { done, failed, skipped } });
    res.json({ success: true, done, failed, skipped });
  } catch (error) { res.status(500).json({ error: error.message }); }
}
