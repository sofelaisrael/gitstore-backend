import GitHubService from '../services/githubService.js';
import supabase from '../services/supabaseService.js';
import { checkHardExclusion } from '../pipeline/exclusion.js';
const QUERIES = ['topic:electron-app', 'topic:tauri-app', 'topic:flutter-desktop', 'topic:desktop-app', 'topic:desktop-application', 'filename:tauri.conf.json', 'filename:wails.json', 'filename:neutralino.config.json'];
export default async function discover(req, res) {
  try {
    const hasBudget = await GitHubService.hasBudget(500);
    if (!hasBudget) return res.json({ skipped: true, reason: 'Low budget' });
    const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const { repos } = await GitHubService.searchRepos(query);
    let queued = 0;
    for (const repo of repos) {
      if (!checkHardExclusion(repo).excluded) {
        const { error } = await supabase.from('repo_queue').upsert({ full_name: `${repo.owner.login}/${repo.name}`, source: 'cron_discovery', priority: 5, status: 'pending', queued_at: new Date().toISOString() }, { onConflict: 'full_name', ignoreDuplicates: true });
        if (!error) queued++;
      }
    }
    await supabase.from('admin_log').insert({ action: 'discover', detail: { query, queued } });
    res.json({ success: true, query, queued });
  } catch (error) { res.status(500).json({ error: error.message }); }
}
