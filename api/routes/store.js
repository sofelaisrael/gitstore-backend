import express from 'express';
import supabase from '../services/supabaseService.js';
import { formatRepo } from '../utils/formatRepo.js';

const router = express.Router();

router.get('/featured', async (req, res) => {
  try {
    const { data: featured } = await supabase.from('repos').select('*, trending_scores(*), detection_signals(*), icon_cache(*)').eq('is_featured', true).limit(1).maybeSingle();
    const { data: trending } = await supabase.from('repos').select('*, trending_scores(*), icon_cache(*), detection_signals(*)').eq('is_listed', true).not('trending_scores.trending_tier', 'is', null).order('trending_score', { foreignTable: 'trending_scores', ascending: false }).limit(12);
    const { data: recent } = await supabase.from('repos').select('*, icon_cache(*), trending_scores(*), detection_signals(*)').eq('is_listed', true).order('indexed_at', { ascending: false }).limit(8);
    const { data: categories } = await supabase.from('repos').select('category').eq('is_listed', true);

    const counts = (categories || []).reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + 1;
      return acc;
    }, {});

    const featuredApp = featured ? formatRepo(featured) : (trending?.[0] ? formatRepo(trending[0]) : null);

    res.json({
      featured: featuredApp,
      trending: (trending || []).map(formatRepo),
      recent: (recent || []).map(formatRepo),
      stats: { total_listed: categories?.length || 0, category_breakdown: counts }
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/trending', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to = from + Number(limit) - 1;
  try {
    const { data } = await supabase.from('repos').select('*, trending_scores(*), icon_cache(*), detection_signals(*)').eq('is_listed', true).not('trending_scores.trending_tier', 'is', null).order('trending_score', { foreignTable: 'trending_scores', ascending: false }).range(from, to);
    res.json((data || []).map(formatRepo));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/recent', async (req, res) => {
  try {
    const { data } = await supabase.from('repos').select('*, icon_cache(*), trending_scores(*), detection_signals(*)').eq('is_listed', true).order('indexed_at', { ascending: false }).limit(8);
    res.json((data || []).map(formatRepo));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const { data: repos } = await supabase.from('repos').select('category').eq('is_listed', true);
    const counts = (repos || []).reduce((acc, curr) => { acc[curr.category] = (acc[curr.category] || 0) + 1; return acc; }, {});
    res.json({ total_indexed: repos?.length || 0, category_breakdown: counts });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/category/:slug', async (req, res) => {
  const { slug } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to = from + Number(limit) - 1;
  try {
    const { data } = await supabase.from('repos').select('*, trending_scores(*), icon_cache(*), detection_signals(*)').eq('is_listed', true).eq('category', slug).order('stars', { ascending: false }).range(from, to);
    res.json((data || []).map(formatRepo));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

export default router;
