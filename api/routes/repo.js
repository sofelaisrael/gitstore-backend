import express from 'express';
import crypto from 'crypto';
import supabase from '../services/supabaseService.js';
import { formatRepo } from '../utils/formatRepo.js';
const router = express.Router();
router.get('/:owner/:name', async (req, res) => {
  try {
    const { data } = await supabase.from('repos').select('*, detection_signals(*), trust_scores(*), trending_scores(*), icon_cache(*)').eq('full_name', `${req.params.owner}/${req.params.name}`).single();
    if (!data) return res.status(404).json({ error: 'Repository not found' });
    res.json(formatRepo(data));
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/:owner/:name/readme', async (req, res) => {
  try {
    const { data } = await supabase.from('repos').select('readme_html').eq('full_name', `${req.params.owner}/${req.params.name}`).single();
    if (!data?.readme_html) return res.status(404).json({ error: 'README not available' });
    res.json({ readme: data.readme_html });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/:owner/:name/releases', async (req, res) => {
  try {
    const { data: repo } = await supabase.from('repos').select('id').eq('full_name', `${req.params.owner}/${req.params.name}`).single();
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    const { data: releases } = await supabase.from('releases').select('*, release_assets(*)').eq('repo_id', repo.id).order('published_at', { ascending: false }).limit(10);
    res.json(releases);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.post('/:owner/:name/flag', async (req, res) => {
  const sessionHash = crypto.createHash('sha256').update(req.ip + (req.headers['user-agent'] || '')).digest('hex');
  try {
    const { data: repo } = await supabase.from('repos').select('id').eq('full_name', `${req.params.owner}/${req.params.name}`).single();
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    await supabase.from('repo_flags').upsert({ repo_id: repo.id, session_hash: sessionHash, reason: req.body.reason, created_at: new Date().toISOString() }, { onConflict: 'repo_id, session_hash' });
    const { count } = await supabase.from('repo_flags').select('*', { count: 'exact', head: true }).eq('repo_id', repo.id).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    if (count >= 3) await supabase.from('repos').update({ is_listed: false }).eq('id', repo.id);
    res.json({ message: 'Flag submitted successfully' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
export default router;
