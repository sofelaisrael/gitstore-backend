import axios from 'axios';
import dotenv from 'dotenv';
import supabase from './supabaseService.js';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class GitHubService {
  static async makeRequest(query, variables = {}) {
    try {
      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.errors) {
        console.error('GitHub API Errors:', response.data.errors);
        throw new Error(`GitHub API Error: ${response.data.errors[0].message}`);
      }

      const rateLimit = response.data.data.rateLimit;
      if (rateLimit) {
        await this.updateRateLimitState(rateLimit);
      }

      return response.data.data;
    } catch (error) {
      console.error('GitHub API Request Failed:', error.message);
      throw error;
    }
  }

  static async updateRateLimitState(rateLimit) {
    const { remaining, resetAt } = rateLimit;
    try {
      await supabase
        .from('rate_limit_state')
        .upsert({ id: 1, remaining, reset_at: resetAt, last_checked: new Date().toISOString() });
    } catch (error) {
      console.error('Failed to update rate limit state in Supabase:', error.message);
    }
  }

  static async hasBudget(minimumRemaining = 500) {
    const { data, error } = await supabase
      .from('rate_limit_state')
      .select('remaining, reset_at')
      .eq('id', 1)
      .single();

    if (error || !data) return true;

    const now = new Date();
    const resetAt = new Date(data.reset_at);

    if (now > resetAt) return true;

    return data.remaining >= minimumRemaining;
  }

  static async getRepoFull(owner, name) {
    const query = `
      query GetRepoFull($owner: String!, $name: String!) {
        rateLimit { remaining resetAt }
        repository(owner: $owner, name: $name) {
          databaseId
          name
          description
          stargazerCount
          forkCount
          openIssues: issues(states: OPEN) { totalCount }
          respondedIssues: issues(first: 1, filterBy: { states: [OPEN, CLOSED] }) {
            nodes {
              comments(first: 1) {
                totalCount
              }
            }
          }
          watchers { totalCount }
          primaryLanguage { name }
          licenseInfo { spdxId }
          createdAt
          pushedAt
          isArchived
          isFork
          defaultBranchRef { name }
          homepageUrl
          owner {
            login
            __typename
            createdAt
            repositories(first: 1) { totalCount }
          }
          repositoryTopics(first: 20) {
            nodes { topic { name } }
          }
          rootTree: object(expression: "HEAD:") {
            ... on Tree {
              entries { name type }
            }
          }
          defaultBranchRef {
            name
            target {
              ... on Commit {
                committedDate
                history(first: 1) { totalCount }
              }
            }
          }
          releases(
            first: 10
            orderBy: { field: CREATED_AT, direction: DESC }
          ) {
            nodes {
              databaseId
              tagName
              name
              descriptionHTML
              publishedAt
              isDraft
              isPrerelease
              releaseAssets(first: 30) {
                nodes {
                databaseId
                  name
                  size
                  downloadUrl
                  contentType
                  downloadCount
                }
              }
            }
          }
        }
      }
    `;
    const data = await this.makeRequest(query, { owner, name });
    return data.repository;
  }

  static async getFileTree(owner, name, expression = "HEAD:") {
    const query = `
      query GetFileTree($owner: String!, $name: String!, $expression: String!) {
        rateLimit { remaining resetAt }
        repository(owner: $owner, name: $name) {
          object(expression: $expression) {
            ... on Tree {
              entries {
                name
                type
                path
              }
            }
          }
        }
      }
    `;
    const data = await this.makeRequest(query, { owner, name, expression });
    return data.repository.object?.entries || [];
  }

  static async getReadme(owner, name) {
    const variations = ["HEAD:README.md", "HEAD:readme.md", "HEAD:README.markdown", "HEAD:readme.markdown"];
    const query = `
      query GetReadme($owner: String!, $name: String!, $expression: String!) {
        rateLimit { remaining resetAt }
        repository(owner: $owner, name: $name) {
          object(expression: $expression) {
            ... on Blob {
              text
            }
          }
        }
      }
    `;

    for (const expression of variations) {
      try {
        const data = await this.makeRequest(query, { owner, name, expression });
        if (data.repository.object?.text) {
          return data.repository.object.text;
        }
      } catch (e) {}
    }
    return null;
  }

  static async getFileContent(owner, name, expression) {
    const query = `
      query GetFileContent($owner: String!, $name: String!, $expression: String!) {
        rateLimit { remaining resetAt }
        repository(owner: $owner, name: $name) {
          object(expression: $expression) {
            ... on Blob {
              text
            }
          }
        }
      }
    `;
    const data = await this.makeRequest(query, { owner, name, expression });
    return data.repository.object?.text || null;
  }

  static async searchRepos(query, after = null) {
    const graphqlQuery = `
      query SearchRepos($query: String!, $after: String) {
        rateLimit { remaining resetAt }
        search(query: $query, type: REPOSITORY, first: 50, after: $after) {
          repositoryCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Repository {
              databaseId
              name
              owner {
                login
                createdAt
              }
              description
              stargazerCount
              forkCount
              createdAt
              pushedAt
              repositoryTopics(first: 10) {
                nodes { topic { name } }
              }
            }
          }
        }
      }
    `;
    const data = await this.makeRequest(graphqlQuery, { query, after });
    return {
      repos: data.search.nodes,
      totalCount: data.search.repositoryCount,
      pageInfo: data.search.pageInfo,
    };
  }

  static async getContributorCount(owner, name) {
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${name}/contributors`, {
        params: { per_page: 1, anon: true },
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
        },
      });
      const link = response.headers['link'];
      if (link) {
        const match = link.match(/page=(\d+)>; rel="last"/);
        if (match) return parseInt(match[1], 10);
      }
      return response.data.length;
    } catch (error) {
      return 0;
    }
  }

  static async getMonthlyActivity(owner, name) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const query = `
      query GetMonthlyActivity($owner: String!, $name: String!, $since: DateTime!) {
        rateLimit { remaining resetAt }
        repository(owner: $owner, name: $name) {
          commits: defaultBranchRef {
            target {
              ... on Commit {
                history(since: $since) {
                  totalCount
                }
              }
            }
          }
          issues(states: CLOSED, filterBy: { since: $since }) {
            totalCount
          }
          pullRequests(states: MERGED) {
            nodes {
              mergedAt
            }
          }
        }
      }
    `;
    const data = await this.makeRequest(query, { owner, name, since: thirtyDaysAgo });
    const repo = data.repository;

    // Filter PRs by mergedAt manually as GraphQL doesn't support 'mergedSince' filter directly
    const mergedPRsCount = repo.pullRequests.nodes.filter(pr => new Date(pr.mergedAt) > new Date(thirtyDaysAgo)).length;

    return {
      commits: repo.commits?.target?.history?.totalCount || 0,
      issuesClosed: repo.issues.totalCount || 0,
      prsMerged: mergedPRsCount
    };
  }
}

export default GitHubService;
