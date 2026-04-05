import GitHubService from '../services/githubService.js';
import supabase from '../services/supabaseService.js';
import { checkHardExclusion } from './exclusion.js';
import { detectApp } from './detection.js';
import { calculateTrust } from './trust.js';
import { resolveIcon } from './iconResolver.js';
import { mapCategory } from './categoryMapper.js';
import { sanitizeReadme } from './readmeSanitizer.js';

export async function enrichRepo(fullName) {
  const [owner, name] = fullName.split('/');
  try {
    const repo = await GitHubService.getRepoFull(owner, name);
    if (!repo) throw new Error('Repo not found on GitHub');
    const exclusion = checkHardExclusion(repo);
    if (exclusion.excluded) return { status: 'skipped', reason: exclusion.reason };

    const fileTree = await GitHubService.getFileTree(owner, name);
    const contentFetcher = {
      getJson: async (path) => {
        const text = await GitHubService.getFileContent(owner, name, `HEAD:${path}`);
        return text ? JSON.parse(text) : null;
      },
      getText: async (path) => {
        return await GitHubService.getFileContent(owner, name, `HEAD:${path}`);
      }
    };

    const detection = await detectApp(repo, fileTree, contentFetcher);
    if (detection.totalScore < 40) return { status: 'skipped', reason: `Low detection score: ${detection.totalScore}`, score: detection.totalScore };

    const contributorCount = await GitHubService.getContributorCount(owner, name);
    repo.contributorCount = contributorCount;
    // Simple heuristic: if any issue has at least one comment, it's considered responded
    repo.issueResponseRate = repo.respondedIssues?.nodes?.[0]?.comments?.totalCount > 0 ? 1 : 0;

    const { data: history } = await supabase.from('repo_history').select('*').eq('repo_id', repo.databaseId).order('recorded_date', { ascending: false }).limit(2);
    const trust = calculateTrust(repo, history || []);
    const icon = await resolveIcon(owner, name, repo.defaultBranchRef?.name || 'main', fileTree, detection.frameworkDetected);
    const topics = repo.repositoryTopics.nodes.map(n => n.topic.name);
    const category = mapCategory(topics);
    const platforms = detectPlatforms(repo);
    const markdown = await GitHubService.getReadme(owner, name);
    const readmeHtml = await sanitizeReadme(markdown);

    const repoData = {
      id: repo.databaseId, owner: repo.owner.login, name: repo.name, full_name: repo.owner.login + '/' + repo.name,
      description: repo.description || '', primary_language: repo.primaryLanguage?.name || 'Unknown',
      stars: repo.stargazerCount, forks: repo.forkCount, open_issues: repo.openIssues.totalCount,
      watchers: repo.watchers.totalCount, license_spdx: repo.licenseInfo?.spdxId || 'Unknown',
      homepage: repo.homepageUrl, topics: topics, default_branch: repo.defaultBranchRef?.name || 'main',
      is_archived: !!repo.isArchived, is_fork: !!repo.isFork, owner_type: repo.owner.__typename,
      owner_created_at: repo.owner.createdAt, owner_repo_count: repo.owner.repositories.totalCount,
      created_at: repo.createdAt, last_pushed_at: repo.pushedAt,
      last_commit_at: repo.defaultBranchRef?.target?.committedDate, contributor_count: contributorCount,
      platforms, category, readme_html: readmeHtml, readme_cached_at: new Date().toISOString(),
      is_listed: trust.totalScore >= 50 && !trust.anomaly_flagged, indexed_at: new Date().toISOString()
    };

    await supabase.from('repos').upsert(repoData);
    await supabase.from('detection_signals').upsert({ repo_id: repo.databaseId, framework_detected: detection.frameworkDetected, framework_score: detection.frameworkScore, manifest_score: detection.manifestScore, topic_score: detection.topicScore, release_score: detection.releaseScore, pkgmgr_score: detection.pkgmgrScore, total_score: detection.totalScore, signals_detail: detection.signalsDetail });
    await supabase.from('trust_scores').upsert({ repo_id: repo.databaseId, account_trust: trust.accountTrust, repo_signals: trust.repoSignals, activity_signals: trust.activitySignals, community_signals: trust.communitySignals, total_score: trust.totalScore, anomaly_flagged: trust.anomaly_flagged, anomaly_reason: trust.anomaly_reason });
    await supabase.from('icon_cache').upsert({ repo_id: repo.databaseId, icon_url: icon.url, source_level: icon.sourceLevel, last_verified: new Date().toISOString() });

    if (repo.releases?.nodes) {
      for (const release of repo.releases.nodes) {
        await supabase.from('releases').upsert({ id: release.databaseId, repo_id: repo.databaseId, tag_name: release.tagName, name: release.name, body: release.descriptionHTML, published_at: release.publishedAt, is_prerelease: release.isPrerelease, is_draft: release.isDraft });
        if (release.releaseAssets?.nodes) {
          for (const asset of release.releaseAssets.nodes) {
            const classification = classifyAsset(asset.name);
            await supabase.from('release_assets').upsert({ id: asset.databaseId, release_id: release.databaseId, repo_id: repo.databaseId, name: asset.name, size: asset.size, download_url: asset.downloadUrl, content_type: asset.contentType, download_count: asset.downloadCount, asset_type: classification.type, platform: classification.platform, zip_confidence: classification.zipConfidence });
          }
        }
      }
    }
    return { status: 'success', totalScore: detection.totalScore, trustScore: trust.totalScore };
  } catch (error) { throw error; }
}

function detectPlatforms(repo) {
  const assets = (repo.releases?.nodes || []).flatMap(r => r.releaseAssets?.nodes || []);
  const platforms = new Set();
  for (const asset of assets) {
    const name = asset.name.toLowerCase();
    if (name.includes('win') || name.includes('windows') || name.endsWith('.exe') || name.endsWith('.msi')) platforms.add('windows');
    if (name.includes('mac') || name.includes('macos') || name.includes('osx') || name.includes('darwin') || name.endsWith('.dmg') || name.endsWith('.pkg')) platforms.add('macos');
    if (name.includes('linux') || name.includes('ubuntu') || name.includes('debian') || name.endsWith('.deb') || name.endsWith('.rpm') || name.endsWith('.appimage') || name.endsWith('.snap') || name.endsWith('.flatpak')) platforms.add('linux');
  }
  return platforms.size === 0 ? ['cross'] : Array.from(platforms);
}

function classifyAsset(name) {
  const lower = name.toLowerCase();
  const ext = lower.split('.').pop();
  let type = 'other';
  let platform = 'unknown';
  let zipConfidence = null;
  const binaryExts = ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'snap', 'flatpak'];
  const archiveExts = ['zip', 'gz', 'tar', '7z', 'rar'];
  if (binaryExts.includes(ext)) type = 'binary';
  else if (archiveExts.includes(ext)) type = 'archive';
  if (lower.includes('win')) platform = 'windows';
  else if (lower.includes('mac') || lower.includes('osx') || lower.includes('darwin')) platform = 'macos';
  else if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian')) platform = 'linux';
  if (ext === 'zip') {
    const platformKeywords = /\b(windows|win32|win64|linux|ubuntu|debian|macos|osx|darwin|x64|x86_64|amd64|arm64|aarch64|portable)\b/i;
    if (platformKeywords.test(lower)) zipConfidence = 'high';
    else if (/v?\d+\.\d+/.test(lower)) zipConfidence = 'low';
    else zipConfidence = 'excluded';
  }
  return { type, platform, zipConfidence };
}
