export function calculateTrendingScore(input, p95BaseScore) {
  const { starsNow, history, commitsLast30d, issuesClosedLast30d, prsMergedLast30d, lastCommitAt } = input;
  const historyDays = history.length;

  if (historyDays < 14) return { repoId: input.repoId, velocityScore: 0, momentumScore: 0, activityScore: 0, freshnessScore: 0, baseScoreNorm: 0, trendingScore: 0, trendingTier: null, historyDays };

  const now = new Date();
  const date7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const date14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const getClosest = (target) => {
    return history.reduce((prev, curr) => {
      const prevDiff = Math.abs(new Date(prev.recorded_date) - target);
      const currDiff = Math.abs(new Date(curr.recorded_date) - target);
      return currDiff < prevDiff ? curr : prev;
    });
  };

  const snap7d = getClosest(date7d);
  const snap14d = getClosest(date14d);

  const stars7d = snap7d?.stars ?? starsNow;
  const stars14d = snap14d?.stars ?? starsNow;

  const velocityNow = (starsNow - stars7d) / Math.max(stars7d, 1);
  const velocity14d = (stars7d - stars14d) / Math.max(stars14d, 1);
  const momentumScore = (velocityNow * 0.6) + (velocity14d * 0.4);

  const rawActivity = (commitsLast30d * 2) + (issuesClosedLast30d * 1.5) + (prsMergedLast30d * 1.5);
  const activityScore = Math.min(rawActivity / 50, 1.0);

  const daysSinceCommit = (now - new Date(lastCommitAt)) / (1000 * 60 * 60 * 24);
  const freshnessScore = 1 / (1 + daysSinceCommit / 30);

  const baseScore = Math.pow(starsNow, 0.3);
  const baseScoreNorm = Math.min(baseScore / Math.max(p95BaseScore, 1), 1.0);

  const trendingScore = (momentumScore * 0.45) + (activityScore * 0.30) + (freshnessScore * 0.15) + (baseScoreNorm * 0.10);

  return { repoId: input.repoId, velocityScore: velocityNow, momentumScore, activityScore, freshnessScore, baseScoreNorm, trendingScore, trendingTier: null, historyDays };
}

export function assignTrendingTiers(results, repoAges) {
  const sorted = [...results].sort((a, b) => b.trendingScore - a.trendingScore);
  const total = sorted.length;
  const p95idx = Math.floor(total * 0.05);
  const p85idx = Math.floor(total * 0.15);
  const p95val = sorted[p95idx]?.trendingScore || 0;
  const p85val = sorted[p85idx]?.trendingScore || 0;

  return results.map(r => {
    const ageMonths = repoAges[r.repoId] || 999;
    let trendingTier = null;
    if (r.trendingScore >= p95val && ageMonths < 12) trendingTier = 'rising';
    else if (r.trendingScore >= p95val) trendingTier = 'hot';
    else if (r.trendingScore >= p85val) trendingTier = 'hot';
    else if (r.baseScoreNorm > 0.75) trendingTier = 'established';
    return { ...r, trendingTier };
  });
}
