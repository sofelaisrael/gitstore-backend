import express from 'express';
import crypto from 'crypto';
import supabase from '../services/supabaseService.js';
import GitHubService from '../services/githubService.js';
import { checkHardExclusion } from '../pipeline/exclusion.js';
const router = express.Router();
function buildCacheKey(query, filters) {
  const normQuery = query.toLowerCase().trim();
  const normFilters = Object.entries(filters || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(',');
  return crypto.createHash('sha256').update(normQuery + '|' + normFilters).digest('hex');
}
function sanitiseSearchQuery(q) { return q.replace(/\b(type|is|repo|user|org|stars|forks|topic|language|size|pushed|created):[^\s]+/gi, '').trim(); }
router.get('/', async (req, res) => {
  const { q, lang, platform, category, sort = 'stars', page = 1 } = req.query;
  const cacheKey = buildCacheKey(q || '', { lang, platform, category, sort, page });
  try {
    const { data: cached } = await supabase.from('search_cache').select('results, hit_count').eq('cache_key', cacheKey).gt('expires_at', new Date().toISOString()).single();
    if (cached) {
      await supabase.from('search_cache').update({ hit_count: cached.hit_count + 1, last_hit: new Date().toISOString() }).eq('cache_key', cacheKey);
      return res.json(cached.results);
    }
    const hasBudget = await GitHubService.hasBudget(500);
    if (!hasBudget) return res.status(429).json({ error: 'Search quota exceeded', retryAfter: 3600 });
    const safeQuery = sanitiseSearchQuery(q || '');
    let ghQuery = safeQuery;
    if (lang) ghQuery += ` language:${lang}`;
    if (platform) ghQuery += ` topic:${platform}-app`;
    if (category) ghQuery += ` topic:${category}`;
    ghQuery += ' -topic:library -topic:framework -is:fork';
    const { repos, totalCount } = await GitHubService.searchRepos(ghQuery);
    const passingRepos = repos.filter(repo => !checkHardExclusion(repo).excluded);
    const fullNames = passingRepos.map(r => r.owner.login + '/' + r.name);
    const { data: storedRepos } = await supabase.from('repos').select('*, icon_cache(*)').in('full_name', fullNames);
    const storedMap = new Map(storedRepos?.map(r => [r.full_name, r]) || []);
    const formattedRepos = passingRepos.map(repo => {
      const fullName = repo.owner.login + '/' + repo.name;
      if (storedMap.has(fullName)) return storedMap.get(fullName);
      return { id: repo.databaseId, owner: repo.owner.login, name: repo.name, fullName, description: repo.description || '', stars: repo.stargazerCount, forks: repo.forkCount, createdAt: repo.createdAt, lastPushedAt: repo.pushedAt, iconUrl: `https://github.com/${repo.owner.login}.png?size=128`, isEnriched: false };
    });
    const toQueue = passingRepos.filter(repo => !storedMap.has(repo.owner.login + '/' + repo.name));
    if (toQueue.length > 0) {
      const queueEntries = toQueue.map(repo => ({ full_name: repo.owner.login + '/' + repo.name, source: 'search_discovery', priority: 7, status: 'pending' }));
      await supabase.from('repo_queue').upsert(queueEntries, { onConflict: 'full_name', ignoreDuplicates: true });
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const results = { repos: formattedRepos, totalCount };
    await supabase.from('search_cache').upsert({ cache_key: cacheKey, results, repo_count: formattedRepos.length, expires_at: expiresAt, cached_at: new Date().toISOString() });
    res.json(results);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
export default router;
