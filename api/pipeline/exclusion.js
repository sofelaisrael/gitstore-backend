const MALWARE_KEYWORDS = [
  'ddos', 'flooder', 'botnet', 'stresser', 'booter', 'nuker', 'spoofer',
  'stealer', 'keylogger', 'rat', 'remote access trojan', 'phishing kit',
  'phisher', 'dropper', 'crypter', 'ransomware', 'rootkit', 'backdoor',
  'stalkerware', 'spy app', 'credential harvester', 'invisible keylogger',
  'hidden tracker', 'monitor without consent',
];

const ADULT_KEYWORDS = [
  'nsfw', 'adult', 'hentai', 'porn', 'xxx', 'eroge',
  'adult-only', '18+', 'explicit content', 'nude', 'nudity'
];

const TUTORIAL_KEYWORDS = [
  'tutorial', 'course', 'homework', 'assignment', 'bootcamp project',
  'learning project', 'for learning', 'beginner project', 'practice project'
];

const NON_APP_ASSET_ONLY_EXTENSIONS = {
  fonts: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
  datasets: ['.csv', '.json', '.parquet', '.db', '.sqlite'],
  docs: ['.pdf', '.epub', '.html'],
  extensions: ['.vsix', '.crx', '.xpi'],
  mods: ['.dll', '.pak', '.mod', '.esp']
};

const GITHUB_AUTO_ASSETS = ['Source code (zip)', 'Source code (tar.gz)'];

export function checkHardExclusion(repo) {
  const topics = (repo.repositoryTopics?.nodes || repo.topics || []).map(n => (n.topic?.name || n).toLowerCase());
  const text = `${repo.name} ${repo.description || ''} ${topics.join(' ')}`.toLowerCase();

  const matchWholeWord = (keyword, target) => {
    const regex = new RegExp(`\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    return regex.test(target);
  };

  for (const kw of MALWARE_KEYWORDS) {
    if (matchWholeWord(kw, text)) return { excluded: true, reason: `malware keyword: ${kw}` };
  }

  for (const kw of ADULT_KEYWORDS) {
    if (matchWholeWord(kw, text)) return { excluded: true, reason: `adult content keyword: ${kw}` };
  }

  for (const kw of TUTORIAL_KEYWORDS) {
    if (matchWholeWord(kw, text)) return { excluded: true, reason: `tutorial/course keyword: ${kw}` };
  }

  if (repo.owner && repo.owner.createdAt && repo.createdAt) {
    const ownerCreatedAt = new Date(repo.owner.createdAt);
    const repoCreatedAt = new Date(repo.createdAt);
    const diffDays = (repoCreatedAt - ownerCreatedAt) / (1000 * 60 * 60 * 24);
    if (diffDays < 14) return { excluded: true, reason: `account created less than 14 days before repo` };
  }

  if (repo.releases && repo.releases.nodes) {
    const assets = repo.releases.nodes.flatMap(r => r.releaseAssets?.nodes || []);
    const relevantAssets = assets.filter(a => !GITHUB_AUTO_ASSETS.includes(a.name));

    if (relevantAssets.length > 0) {
      const extensions = relevantAssets.map(a => a.name.toLowerCase().split('.').pop());
      for (const [type, exts] of Object.entries(NON_APP_ASSET_ONLY_EXTENSIONS)) {
        const cleanExts = exts.map(e => e.replace('.', ''));
        if (extensions.every(ext => cleanExts.includes(ext))) return { excluded: true, reason: `release assets are only ${type}` };
      }
    }
  }

  return { excluded: false, reason: null };
}
