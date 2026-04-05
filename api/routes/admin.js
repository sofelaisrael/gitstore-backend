import express from 'express';
import supabase from '../services/supabaseService.js';
const router = express.Router();
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const adminAuth = (req, res, next) => {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
};
router.use(adminAuth);
router.get('/queue', async (req, res) => {
  try { res.json((await supabase.from('repo_queue').select('*').eq('status', req.query.status || 'pending').order('priority', { ascending: true }).order('queued_at', { ascending: false })).data); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/queue', async (req, res) => {
  try { await supabase.from('repo_queue').upsert({ full_name: req.body.full_name, source: 'manual', priority: req.body.priority || 5, status: 'pending', queued_at: new Date().toISOString() }, { onConflict: 'full_name' }); res.json({ message: 'Added to queue' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/delist/:repoId', async (req, res) => {
  try { await supabase.from('repos').update({ is_listed: false }).eq('id', req.params.repoId); res.json({ message: 'De-listed' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/relist/:repoId', async (req, res) => {
  try { await supabase.from('repos').update({ is_listed: true }).eq('id', req.params.repoId); res.json({ message: 'Re-listed' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/feature/:repoId', async (req, res) => {
  try { await supabase.from('repos').update({ is_featured: false }).eq('is_featured', true); await supabase.from('repos').update({ is_featured: true }).eq('id', req.params.repoId); res.json({ message: 'Featured' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/rate-limit', async (req, res) => {
  try { res.json((await supabase.from('rate_limit_state').select('*').eq('id', 1).single()).data); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/indexed-count', async (req, res) => {
  try { res.json({ count: (await supabase.from('repos').select('*', { count: 'exact', head: true })).count }); } catch (e) { res.status(500).json({ error: e.message }); }
});
export default router;
