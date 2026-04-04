/* ============================================================
   background.js — Codebase Explainer
   Detects which GitHub repo the user is on and stores it.
   ============================================================ */

const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/.*)?$/;

/* Reserved GitHub URL prefixes that are not repos */
const SKIP_OWNERS = [
  'settings', 'marketplace', 'explore', 'notifications',
  'login', 'signup', 'orgs', 'users', 'sponsors',
  'about', 'pricing', 'features', 'security', 'enterprise',
  'topics', 'trending', 'collections', 'events', 'pulls',
  'issues', 'dashboard', 'new', 'organizations'
];

function parseRepo(url) {
  if (!url) return null;
  const match = url.match(GITHUB_REPO_PATTERN);
  if (!match) return null;

  const owner = match[1];
  const repo  = match[2];

  /* Skip reserved GitHub pages */
  if (SKIP_OWNERS.includes(owner.toLowerCase())) return null;

  /* Skip dot-files or clearly non-repo segments */
  if (owner.startsWith('.') || repo.startsWith('.')) return null;

  return { owner, repo, fullName: `${owner}/${repo}` };
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  const repoInfo = parseRepo(tab.url);
  if (repoInfo) {
    chrome.storage.session.set({ currentRepo: repoInfo });
  } else {
    chrome.storage.session.remove('currentRepo');
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (!tab.url) return;
    const repoInfo = parseRepo(tab.url);
    if (repoInfo) {
      chrome.storage.session.set({ currentRepo: repoInfo });
    } else {
      chrome.storage.session.remove('currentRepo');
    }
  });
});