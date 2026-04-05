export function formatRepo(dbRepo) {
  if (!dbRepo) return null;

  const trust = Array.isArray(dbRepo.trust_scores) ? dbRepo.trust_scores[0] : dbRepo.trust_scores;
  const trending = Array.isArray(dbRepo.trending_scores) ? dbRepo.trending_scores[0] : dbRepo.trending_scores;
  const detection = Array.isArray(dbRepo.detection_signals) ? dbRepo.detection_signals[0] : dbRepo.detection_signals;
  const icon = Array.isArray(dbRepo.icon_cache) ? dbRepo.icon_cache[0] : dbRepo.icon_cache;

  // Derive trustTier from trust_scores.total_score
  let trustTier = 'low';
  const trustScore = trust?.total_score || 0;
  if (trustScore >= 80) trustTier = 'verified';
  else if (trustScore >= 65) trustTier = 'trusted';
  else if (trustScore >= 50) trustTier = 'community';

  return {
    id: Number(dbRepo.id),
    owner: dbRepo.owner,
    name: dbRepo.name,
    fullName: dbRepo.full_name,
    description: dbRepo.description || '',
    primaryLanguage: dbRepo.primary_language || 'Unknown',
    stars: dbRepo.stars || 0,
    forks: dbRepo.forks || 0,
    openIssues: dbRepo.open_issues || 0,
    watchers: dbRepo.watchers || 0,
    licenseSpdx: dbRepo.license_spdx || 'Unknown',
    homepage: dbRepo.homepage || null,
    topics: dbRepo.topics || [],
    platforms: dbRepo.platforms || [],
    category: dbRepo.category || 'uncategorised',
    contributorCount: dbRepo.contributor_count || 0,
    isArchived: !!dbRepo.is_archived,
    createdAt: dbRepo.created_at,
    lastCommitAt: dbRepo.last_commit_at,
    iconUrl: icon?.icon_url || `https://github.com/${dbRepo.owner}.png?size=128`,
    trendingTier: trending?.trending_tier || null,
    trendingScore: Number(trending?.trending_score || 0),
    trustTier,
    detectionScore: detection?.total_score || 0,
    frameworkDetected: detection?.framework_detected || null,
    indexedAt: dbRepo.indexed_at
  };
}
