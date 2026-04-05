const CATEGORY_MAP = {
  'developer-tools': ['ide', 'editor', 'terminal', 'devtools', 'developer-tools', 'debugging', 'git', 'database-client', 'api-client'],
  'productivity': ['productivity', 'notes', 'todo', 'task-manager', 'calendar', 'writing', 'markdown', 'office'],
  'media': ['media-player', 'video', 'audio', 'music', 'photo', 'image-viewer', 'podcast'],
  'communication': ['chat', 'messaging', 'email', 'video-call', 'communication', 'irc', 'matrix'],
  'security': ['password-manager', 'vpn', 'encryption', 'privacy', 'security', 'firewall'],
  'utilities': ['utility', 'tool', 'system', 'clipboard', 'launcher', 'file-manager', 'automation'],
  'gaming': ['game', 'emulator', 'gaming', 'game-engine'],
  'graphics': ['design', 'graphics', 'drawing', 'svg', '3d', 'animation', 'cad'],
  'finance': ['finance', 'budget', 'accounting', 'crypto-wallet', 'investment'],
};

export function mapCategory(topics) {
  const lowercaseTopics = (topics || []).map(t => t.toLowerCase());
  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    if (lowercaseTopics.some(t => keywords.includes(t))) return category;
  }
  return 'uncategorised';
}
