export function calculateTrust(repo, history = []) {
  let accountTrust = 0;
  let repoSignals = 0;
  let activitySignals = 0;
  let communitySignals = 0;

  const ownerCreatedAt = new Date(repo.owner.createdAt);
  const ownerAgeMonths = (new Date() - ownerCreatedAt) / (1000 * 60 * 60 * 24 * 30);
  if (ownerAgeMonths > 12) accountTrust += 15;
  if (repo.owner.repositories?.totalCount > 3) accountTrust += 10;
  if (repo.owner.__typename === 'Organization') accountTrust += 5;

  const stars = repo.stargazerCount;
  if (stars >= 100) repoSignals += 10;
  if (stars >= 500) repoSignals += 5;
  if (stars >= 2000) repoSignals += 5;
  const repoAgeMonths = (new Date() - new Date(repo.createdAt)) / (1000 * 60 * 60 * 24 * 30);
  if (repoAgeMonths > 6) repoSignals += 10;

  const lastCommitDate = new Date(repo.defaultBranchRef?.target?.committedDate || repo.pushedAt);
  const daysSinceCommit = (new Date() - lastCommitDate) / (1000 * 60 * 60 * 24);
  if (daysSinceCommit <= 90) activitySignals += 10;
  if (repo.contributorCount > 3) activitySignals += 5;
  if (repo.issueResponseRate > 0) activitySignals += 5;

  const rootFiles = (repo.rootTree?.entries || []).map(e => e.name.toUpperCase());
  if (rootFiles.some(f => f.startsWith('LICENSE'))) communitySignals += 10;
  if (rootFiles.some(f => f === 'SECURITY.MD')) communitySignals += 5;
  if (rootFiles.some(f => f === 'CONTRIBUTING.MD')) communitySignals += 5;

  let totalScore = accountTrust + repoSignals + activitySignals + communitySignals;
  let anomalyFlagged = false;
  let anomalyReason = null;

  if (history.length >= 2) {
    const latest = history[0];
    const previous = history[1];
    const starDelta = latest.stars - previous.stars;
    const forkDelta = latest.forks - previous.forks;
    if (starDelta > 500 && forkDelta < starDelta * 0.02) {
      anomalyFlagged = true;
      anomalyReason = `Star spike: +${starDelta} stars, +${forkDelta} forks since last snapshot`;
      totalScore = Math.min(totalScore, 30);
    }
  }

  return { accountTrust, repoSignals, activitySignals, communitySignals, totalScore, anomalyFlagged, anomalyReason };
}
