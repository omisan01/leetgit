/**
 * Helper to make authenticated GitHub API requests.
 */
async function githubFetch(endpoint, options = {}) {
    const { github_token } = await chrome.storage.local.get('github_token');
    if (!github_token) throw new Error('Not authenticated with GitHub');

    const url = endpoint.startsWith('https://') ? endpoint : `https://api.github.com${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${github_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const error = new Error(data?.message || `GitHub API error: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return data;
}

/**
 * Validates whether a repo exists and is ready for commits.
 * If empty, initializes it with a base README.md.
 */
export async function setupRepository(repoFullName) {
    const [owner, repo] = repoFullName.trim().split('/');
    if (!owner || !repo) {
        throw new Error('Please enter repository as "username/repo-name"');
    }

    let repoData;
    try {
        // Check if repo exists
        repoData = await githubFetch(`/repos/${owner}/${repo}`);
    } catch (err) {
        if (err.status === 404) {
            throw new Error(`Repository "${owner}/${repo}" not found or no access.`);
        }
        throw err;
    }

    const defaultBranch = repoData.default_branch || 'main';

    // Check if repository is empty (has zero commits / no default branch head)
    try {
        await githubFetch(`/repos/${owner}/${repo}/branches/${defaultBranch}`);
    } catch (err) {
        if (err.status === 404) {
            // Repo is completely empty; make an initial commit
            await initializeEmptyRepo(owner, repo, defaultBranch);
        } else {
            throw err;
        }
    }

    return {
        full_name: repoData.full_name,
        html_url: repoData.html_url,
        default_branch: defaultBranch
    };
}

/**
 * Creates a brand new repository under the user's account with auto-init.
 */
export async function createRepository(repoName, isPrivate = false) {
    const newRepo = await githubFetch('/user/repos', {
        method: 'POST',
        body: JSON.stringify({
            name: repoName.trim(),
            description: 'Collection of LeetCode solutions synced automatically via LeetGit',
            private: isPrivate,
            auto_init: true // Automatically creates initial commit with README.md
        })
    });

    return {
        full_name: newRepo.full_name,
        html_url: newRepo.html_url,
        default_branch: newRepo.default_branch || 'main'
    };
}

async function initializeEmptyRepo(owner, repo, branch) {
    const content = btoa('# LeetCode Solutions\nSynced using [LeetGit](https://github.com)');
    await githubFetch(`/repos/${owner}/${repo}/contents/README.md`, {
        method: 'PUT',
        body: JSON.stringify({
            message: 'Initial commit by LeetGit',
            content,
            branch
        })
    });
}

/**
 * UTF-8 safe Base64 encoder (handles math symbols, emojis, and accents)
 */
function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Gets the SHA of a file if it already exists (needed for updates).
 */
export async function getFileSha(repoFullName, path, branch) {
    try {
        const data = await githubFetch(`/repos/${repoFullName}/contents/${path}?ref=${branch}`);
        return data.sha;
    } catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}

/**
 * Pushes or updates a single file in the repository.
 */
export async function commitFile(repoFullName, branch, path, content, commitMessage) {
    const sha = await getFileSha(repoFullName, path, branch);

    return await githubFetch(`/repos/${repoFullName}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
            message: commitMessage,
            content: utf8ToBase64(content),
            branch,
            ...(sha ? { sha } : {})
        })
    });
}