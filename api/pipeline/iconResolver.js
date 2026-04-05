import axios from 'axios';

const LEVEL_1_PATHS = ['icon.png', 'icon.ico', 'icon.svg', 'icon.icns', 'app.png', 'app.ico', 'app.svg'];
const LEVEL_2_PATHS = [
  'assets/icon.png', 'assets/icon.ico', 'assets/icon.svg', 'assets/icon.icns',
  'resources/icon.png', 'resources/icon.ico', 'build/icon.png', 'build/icon.ico',
  'build/icons/icon.png', 'build/icons/256x256.png', 'public/icon.png', 'public/favicon.png'
];
const LEVEL_3_BY_FRAMEWORK = {
  electron: ['build/icon.png', 'electron/icon.png'],
  tauri: ['src-tauri/icons/icon.png', 'src-tauri/icons/Square30x30Logo.png'],
  flutter: ['windows/runner/resources/app_icon.ico', 'macos/Runner/Assets.xcassets/AppIcon.appiconset/'],
  neutralino: ['icons/appIcon.png'],
  wpf: [],
};
const LEVEL_4_PATTERN = /\b(logo|icon|app[-_]icon|app-logo)\b.*\.(png|svg|ico|icns)$/i;

async function verifyImageUrl(url) {
  try {
    const res = await axios.head(url, { timeout: 3000 });
    const ct = res.headers['content-type'] || '';
    return res.status === 200 && ct.startsWith('image/');
  } catch {
    try {
        const res = await axios.get(url, { timeout: 3000, headers: { Range: 'bytes=0-1023' } });
        const ct = res.headers['content-type'] || '';
        return res.status >= 200 && res.status < 300 && ct.startsWith('image/');
    } catch { return false; }
  }
}

export async function resolveIcon(owner, repo, branch, fileTree, frameworkDetected) {
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  const avatarUrl = `https://github.com/${owner}.png?size=128`;

  const check = async (path, level) => {
    if (!fileTree.find(f => f.path === path)) return null;
    const url = `${rawBase}/${path}`;
    if (await verifyImageUrl(url)) return { url, sourceLevel: level };
    return null;
  };

  for (const p of LEVEL_1_PATHS) {
    const result = await check(p, 1);
    if (result) return result;
  }

  for (const p of LEVEL_2_PATHS) {
    const result = await check(p, 2);
    if (result) return result;
  }

  if (frameworkDetected && LEVEL_3_BY_FRAMEWORK[frameworkDetected]) {
    for (const p of LEVEL_3_BY_FRAMEWORK[frameworkDetected]) {
      const result = await check(p, 3);
      if (result) return result;
    }
  }

  const candidates = fileTree
    .filter(f => LEVEL_4_PATTERN.test(f.path))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  for (const candidate of candidates) {
    const url = `${rawBase}/${candidate.path}`;
    if (await verifyImageUrl(url)) return { url, sourceLevel: 4 };
  }

  return { url: avatarUrl, sourceLevel: 5 };
}
