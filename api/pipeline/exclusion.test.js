import { checkHardExclusion } from '../pipeline/exclusion.js';

describe('Exclusion Pipeline', () => {
  test('excludes malware keywords', () => {
    const repo = { name: 'my-ddos-tool', description: 'a simple tool', repositoryTopics: { nodes: [] } };
    expect(checkHardExclusion(repo).excluded).toBe(true);
  });

  test('excludes adult content', () => {
    const repo = { name: 'cool-app', description: 'contains nsfw content', repositoryTopics: { nodes: [] } };
    expect(checkHardExclusion(repo).excluded).toBe(true);
  });

  test('excludes young accounts', () => {
    const repo = {
      name: 'new-app',
      owner: { createdAt: '2023-10-01T00:00:00Z' },
      createdAt: '2023-10-05T00:00:00Z'
    };
    expect(checkHardExclusion(repo).excluded).toBe(true);
  });

  test('passes legitimate apps', () => {
    const repo = {
      name: 'open-hub',
      description: 'A great open source store',
      owner: { createdAt: '2020-01-01T00:00:00Z' },
      createdAt: '2023-01-01T00:00:00Z',
      repositoryTopics: { nodes: [{ topic: { name: 'desktop-app' } }] }
    };
    expect(checkHardExclusion(repo).excluded).toBe(false);
  });
});
