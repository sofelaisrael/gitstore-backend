export function formatRepo(dbRepo) {
  if (!dbRepo) return null;

  // Derive trustTier from trust_scores.total_score
  let trustTier = 'low';
  const trustScore = dbRepo.trust_scores?.total_score || 0;
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
    iconUrl: dbRepo.icon_cache?.icon_url || `https://github.com/${dbRepo.owner}.png?size=128`,
    trendingTier: dbRepo.trending_scores?.trending_tier || null,
    trendingScore: Number(dbRepo.trending_scores?.trending_score || 0),
    trustTier,
    detectionScore: dbRepo.detection_signals?.total_score || 0,
    frameworkDetected: dbRepo.detection_signals?.framework_detected || null,
    indexedAt: dbRepo.indexed_at
  };
}
