import supabase from '../services/supabaseService.js';
import { calculateTrendingScore, assignTrendingTiers } from '../pipeline/trendingLogic.js';
import GitHubService from '../services/githubService.js';

export default async function trending(req, res) {
  try {
    const { data: repos } = await supabase.from('repos').select('id, owner, name, stars, last_commit_at, created_at').eq('is_listed', true);
    if (!repos?.length) return res.json({ message: 'No listed repos' });

    const { data: history } = await supabase.from('repo_history').select('*').in('repo_id', repos.map(r => r.id)).order('recorded_date', { ascending: false });

    const baseScores = repos.map(r => Math.pow(r.stars, 0.3));
    const sortedBaseScores = [...baseScores].sort((a, b) => a - b);
    const p95BaseScore = sortedBaseScores[Math.floor(sortedBaseScores.length * 0.95)] || 0;

    const historyMap = (history || []).reduce((acc, curr) => {
      acc[curr.repo_id] = acc[curr.repo_id] || [];
      acc[curr.repo_id].push(curr);
      return acc;
    }, {});

    const results = [];
    for (const repo of repos) {
      const activity = await GitHubService.getMonthlyActivity(repo.owner, repo.name);
      results.push(calculateTrendingScore({
        repoId: repo.id,
        starsNow: repo.stars,
        history: historyMap[repo.id] || [],
        commitsLast30d: activity.commits,
        issuesClosedLast30d: activity.issuesClosed,
        prsMergedLast30d: activity.prsMerged,
        lastCommitAt: repo.last_commit_at
      }, p95BaseScore));
    }

    const repoAges = repos.reduce((acc, repo) => {
      acc[repo.id] = (new Date() - new Date(repo.created_at)) / (1000 * 60 * 60 * 24 * 30);
      return acc;
    }, {});

    const tieredResults = assignTrendingTiers(results, repoAges);

    const upsertData = tieredResults.map(r => ({
      repo_id: r.repoId,
      velocity_score: r.velocityScore,
      momentum_score: r.momentumScore,
      activity_score: r.activityScore,
      freshness_score: r.freshnessScore,
      base_score_norm: r.baseScoreNorm,
      trending_score: r.trendingScore,
      trending_tier: r.trendingTier,
      history_days: r.historyDays,
      calculated_at: new Date().toISOString()
    }));

    await supabase.from('trending_scores').upsert(upsertData, { onConflict: 'repo_id' });
    await supabase.from('admin_log').insert({ action: 'trending', detail: { count: results.length } });
    res.json({ success: true, count: results.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
}
