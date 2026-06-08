const axios = require('axios');
const env = require('../config/env');
const Activity = require('../models/Activity');
const User = require('../models/User');

class GitHubService {
  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  }

  async syncRepoActivity(repoFullName, projectId) {
    try {
      const [commits, pulls, issues] = await Promise.all([
        this.api.get(`/repos/${repoFullName}/commits`, { params: { per_page: 30 } }),
        this.api.get(`/repos/${repoFullName}/pulls`, { params: { state: 'all', per_page: 20 } }),
        this.api.get(`/repos/${repoFullName}/issues`, { params: { state: 'all', per_page: 20, filter: 'all' } }),
      ]);

      for (const commit of commits.data) {
        const user = await User.findOne({ githubUsername: commit.author?.login }).catch(() => null);
        if (user) {
          await Activity.create({
            user: user._id,
            domain: user.domain,
            type: 'github_commit',
            source: 'github',
            description: commit.commit.message.substring(0, 200),
            metadata: { repo: repoFullName, sha: commit.sha, url: commit.html_url },
            score: 3,
          });
        }
      }

      for (const pr of pulls.data) {
        const user = await User.findOne({ githubUsername: pr.user?.login }).catch(() => null);
        if (user) {
          await Activity.create({
            user: user._id,
            domain: user.domain,
            type: 'github_pr',
            source: 'github',
            description: `PR: ${pr.title}`,
            metadata: { repo: repoFullName, prNumber: pr.number, url: pr.html_url, state: pr.state },
            score: 5,
          });
        }
      }

      for (const issue of issues.data) {
        if (!issue.pull_request) {
          const user = await User.findOne({ githubUsername: issue.user?.login }).catch(() => null);
          if (user) {
            await Activity.create({
              user: user._id,
              domain: user.domain,
              type: 'github_issue',
              source: 'github',
              description: `Issue: ${issue.title}`,
              metadata: { repo: repoFullName, issueNumber: issue.number, url: issue.html_url, state: issue.state },
              score: 3,
            });
          }
        }
      }

      return { commits: commits.data.length, pulls: pulls.data.length, issues: issues.data.filter((i) => !i.pull_request).length };
    } catch (error) {
      console.error(`GitHub sync error for ${repoFullName}:`, error.message);
      return null;
    }
  }

  async getUserRepos(username) {
    try {
      const { data } = await this.api.get(`/users/${username}/repos`, { params: { per_page: 50, sort: 'updated' } });
      return data.map((r) => ({ name: r.full_name, url: r.html_url, description: r.description }));
    } catch {
      return [];
    }
  }

  async sync() {
    try {
      const Project = require('../models/Project');
      const projects = await Project.find({ githubRepo: { $ne: '' }, isActive: true });
      let total = { repos: 0, commits: 0, pulls: 0, issues: 0 };
      for (const p of projects) {
        const result = await this.syncRepoActivity(p.githubRepo, p._id);
        if (result) {
          total.repos++;
          total.commits += result.commits;
          total.pulls += result.pulls;
          total.issues += result.issues;
        }
      }
      return total;
    } catch (error) {
      console.error('GitHub auto-sync error:', error.message);
      return null;
    }
  }
}

module.exports = new GitHubService();
