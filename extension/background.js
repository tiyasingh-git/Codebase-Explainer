/* Detects which GitHub repo the user is on and stores it */

const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/.*)?$/;

const SKIP_OWNERS = ['settings', 'marketplace', 'explore', 'notifications', 'login', 'signup'];

function parseRepo(url) {
  const match = url.match(GITHUB_REPO_PATTERN);
  if (!match) return null;
  const owner = match[1];
  const repo  = match[2];
  if (SKIP_OWNERS.includes(owner)) return null;
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