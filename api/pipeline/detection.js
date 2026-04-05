import GitHubService from '../services/githubService.js';

const FRAMEWORK_CHECKS = [
  {
    name: 'electron',
    score: 40,
    check: async (files, contentFetcher) => {
      if (!files.find(f => f.name === 'package.json')) return false;
      const pkgJson = await contentFetcher.getJson('package.json');
      return pkgJson?.dependencies?.electron || pkgJson?.devDependencies?.electron;
    }
  },
  {
    name: 'tauri',
    score: 40,
    check: (files) => files.find(f => f.path.includes('src-tauri/tauri.conf.json'))
  },
  {
    name: 'flutter',
    score: 40,
    check: async (files, contentFetcher) => {
      if (!files.find(f => f.name === 'pubspec.yaml')) return false;
      const pubspec = await contentFetcher.getText('pubspec.yaml');
      return pubspec?.includes('sdk: flutter');
    }
  },
  {
    name: 'wails',
    score: 40,
    check: (files) => files.find(f => f.name === 'wails.json')
  },
  {
    name: 'neutralino',
    score: 40,
    check: (files) => files.find(f => f.name === 'neutralino.config.json')
  },
  {
    name: 'wpf',
    score: 40,
    check: async (files, contentFetcher) => {
      const csproj = files.find(f => f.name.endsWith('.csproj'));
      if (!csproj) return false;
      const xml = await contentFetcher.getText(csproj.name);
      return xml?.includes('<UseWPF>true') || xml?.includes('<UseWindowsForms>true');
    }
  },
  {
    name: 'qt',
    score: 38,
    check: async (files, contentFetcher) => {
      if (files.find(f => f.name.endsWith('.pro'))) return true;
      const cmake = await contentFetcher.getText('CMakeLists.txt');
      return cmake?.includes('find_package(Qt');
    }
  },
  {
    name: 'javafx',
    score: 35,
    check: async (files, contentFetcher) => {
      const buildFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
      for (const f of buildFiles) {
        if (files.find(file => file.name === f)) {
          const content = await contentFetcher.getText(f);
          if (content?.toLowerCase().includes('javafx')) return true;
        }
      }
      return false;
    }
  },
  {
    name: 'pyinstaller',
    score: 35,
    check: async (files, contentFetcher) => {
      if (files.find(f => f.name.endsWith('.spec'))) return true;
      const toml = await contentFetcher.getText('pyproject.toml');
      return toml?.includes('pyinstaller');
    }
  },
  {
    name: 'nsis',
    score: 30,
    check: (files) => files.find(f => f.name.endsWith('.nsi') || f.name.endsWith('.nsis'))
  },
  {
    name: 'inno-setup',
    score: 30,
    check: (files) => files.find(f => f.name.endsWith('.iss'))
  }
];

const MANIFEST_CHECKS = [
  { pattern: 'Info.plist', score: 25 },
  { pattern: /\.desktop$/, score: 25 },
  { pattern: 'snap/snapcraft.yaml', score: 20 },
  { pattern: /\.flatpakref$/, score: 20 },
  { pattern: 'Package.appxmanifest', score: 25 },
  { pattern: /setup\.cfg/, score: 20 }
];

const APP_TOPICS = new Set([
  'desktop-app', 'desktop-application', 'electron-app', 'tauri-app',
  'cross-platform', 'gui', 'gui-application', 'windows-app', 'macos-app',
  'linux-app', 'flutter-app', 'native-app', 'open-source-software',
  'desktop-client', 'desktop-gui'
]);

const BINARY_EXTENSIONS = new Set(['.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage', '.snap', '.flatpak']);
const PLATFORM_KEYWORDS_RE = /\b(windows|win32|win64|linux|ubuntu|debian|macos|osx|darwin|x64|x86_64|amd64|arm64|aarch64|portable)\b/i;

export async function detectApp(repo, fileTree, contentFetcher) {
  const result = {
    repoId: repo.databaseId,
    frameworkDetected: null,
    frameworkScore: 0,
    manifestScore: 0,
    topicScore: 0,
    releaseScore: 0,
    pkgmgrScore: 0,
    totalScore: 0,
    signalsDetail: {}
  };

  for (const fw of FRAMEWORK_CHECKS) {
    try {
      const matched = await fw.check(fileTree, contentFetcher);
      if (matched) {
        if (fw.score > result.frameworkScore) {
          result.frameworkScore = fw.score;
          result.frameworkDetected = fw.name;
        }
      }
    } catch (e) {}
  }

  for (const m of MANIFEST_CHECKS) {
    const matched = typeof m.pattern === 'string'
      ? fileTree.find(f => f.path === m.pattern)
      : fileTree.find(f => m.pattern.test(f.path));
    if (matched) {
      result.manifestScore = m.score;
      break;
    }
  }

  const topics = (repo.repositoryTopics?.nodes || []).map(n => n.topic.name.toLowerCase());
  const matchedTopics = topics.filter(t => APP_TOPICS.has(t));
  result.topicScore = Math.min(matchedTopics.length * 5, 15);
  result.signalsDetail.topics = matchedTopics;

  const releases = (repo.releases?.nodes || []).filter(r => !r.isDraft && !r.isPrerelease);
  const assets = releases.flatMap(r => r.releaseAssets?.nodes || []);

  let releaseScore = 0;
  for (const asset of assets) {
    const lowerName = asset.name.toLowerCase();
    const ext = '.' + lowerName.split('.').pop();

    if (BINARY_EXTENSIONS.has(ext)) {
      releaseScore = 15;
      break;
    }

    if (ext === '.zip' || ext === '.gz' || ext === '.tar') {
      if (PLATFORM_KEYWORDS_RE.test(lowerName)) {
        releaseScore = Math.max(releaseScore, 10);
      } else if (/v?\d+\.\d+/.test(lowerName) && result.frameworkScore > 0) {
        releaseScore = Math.max(releaseScore, 5);
      }
    }
  }
  result.releaseScore = releaseScore;

  const pkgmgrFiles = ['Formula/', 'Casks/'];
  const hasPkgMgr = fileTree.find(f => pkgmgrFiles.some(p => f.path.startsWith(p))) ||
                    topics.includes('homebrew') ||
                    (repo.description || '').toLowerCase().includes('aur');
  result.pkgmgrScore = hasPkgMgr ? 5 : 0;

  result.totalScore = result.frameworkScore + result.manifestScore + result.topicScore + result.releaseScore + result.pkgmgrScore;

  return result;
}
