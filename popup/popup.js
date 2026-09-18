import { setupRepository, createRepository } from '../scripts/github-api.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Views
    const views = {
        login: document.getElementById('view-login'),
        repoSetup: document.getElementById('view-repo-setup'),
        dashboard: document.getElementById('view-dashboard'),
        settings: document.getElementById('view-settings')
    };

    // Inputs & Controls
    const loginBtn = document.getElementById('login-btn');
    const authFlow = document.getElementById('auth-flow');
    const pollStatus = document.getElementById('poll-status');
    const repoInput = document.getElementById('repo-name-input');
    const createNewToggle = document.getElementById('create-new-toggle');
    const linkRepoBtn = document.getElementById('link-repo-btn');
    const repoError = document.getElementById('repo-error');
    const dashboardRepoLink = document.getElementById('dashboard-repo-link');
    const bulkSyncBtn = document.getElementById('bulk-sync-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsBackBtn = document.getElementById('settings-back-btn');
    const changeRepoBtn = document.getElementById('change-repo-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const settingsLogin = document.getElementById('settings-login');
    const settingsAvatar = document.getElementById('settings-avatar');
    const syncStatus = document.getElementById('sync-status');
    const progressText = document.getElementById('progress-text');
    const progressBadge = document.getElementById('progress-badge');

    function showView(activeViewName) {
        Object.entries(views).forEach(([name, el]) => {
            if (name === activeViewName) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    }

    async function updateDashboardStats() {
        progressText.textContent = 'Checking LeetCode...';

        chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_STATS' }, (stats) => {
            if (!stats) return;

            if (!stats.isSignedIn) {
                progressText.textContent = 'Not logged into LeetCode';
                progressBadge.textContent = 'Offline';
                return;
            }

            const { syncedCount, totalSolved } = stats;
            progressText.textContent = `${syncedCount} / ${totalSolved} Solved`;

            const percent = totalSolved > 0 ? Math.min(100, Math.round((syncedCount / totalSolved) * 100)) : 0;
            progressBadge.textContent = `${percent}%`;

            if (syncedCount >= totalSolved && totalSolved > 0) {
                bulkSyncBtn.disabled = true;
                bulkSyncBtn.textContent = 'All Solves Up to Date';
                progressBadge.style.background = '#dcfce7';
                progressBadge.style.color = '#15803d';
            } else {
                bulkSyncBtn.disabled = false;
                bulkSyncBtn.textContent = `Bulk Sync (${totalSolved - syncedCount} remaining)`;
                progressBadge.style.background = '#e2e8f0';
                progressBadge.style.color = '#475569';
            }
        });
    }

    async function routeView() {
        const data = await chrome.storage.local.get(['github_token', 'github_user', 'target_repo']);

        if (!data.github_token) {
            showView('login');
            return;
        }

        if (!data.target_repo) {
            // Pre-fill input with sensible default
            repoInput.value = 'leetcode-solutions';
            showView('repoSetup');
            return;
        }

        // Authenticated & Repo linked
        dashboardRepoLink.textContent = data.target_repo.full_name;
        dashboardRepoLink.href = data.target_repo.html_url;

        settingsLogin.textContent = `@${data.github_user?.login || 'user'}`;
        settingsAvatar.src = data.github_user?.avatar_url || '';

        showView('dashboard');
        updateDashboardStats();
    }

    await routeView();

    // Watch for background auth updates
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.github_token || changes.target_repo) {
            routeView();
        }
    });

    // 1. Auth Flow Trigger
    loginBtn.addEventListener('click', () => {
        loginBtn.disabled = true;
        authFlow.classList.remove('hidden');
        pollStatus.textContent = 'Connecting...';

        chrome.runtime.sendMessage({ type: 'START_GITHUB_AUTH' }, (res) => {
            if (res?.error) {
                pollStatus.textContent = `Error: ${res.error}`;
                loginBtn.disabled = false;
            }
        });
    });

    // 2. Link / Create Repository
    linkRepoBtn.addEventListener('click', async () => {
        repoError.classList.add('hidden');
        linkRepoBtn.disabled = true;
        linkRepoBtn.textContent = 'Configuring repository...';

        const rawInput = repoInput.value.trim();
        const shouldCreate = createNewToggle.checked;
        const { github_user } = await chrome.storage.local.get('github_user');

        try {
            let targetRepo;

            if (shouldCreate) {
                // Strip out owner if typed
                const repoOnly = rawInput.includes('/') ? rawInput.split('/')[1] : rawInput;
                targetRepo = await createRepository(repoOnly, false);
            } else {
                // Form "owner/repo" if only repo name was supplied
                const fullPath = rawInput.includes('/') ? rawInput : `${github_user.login}/${rawInput}`;
                targetRepo = await setupRepository(fullPath);
            }

            await chrome.storage.local.set({ target_repo: targetRepo });
            routeView();
        } catch (err) {
            repoError.textContent = err.message;
            repoError.classList.remove('hidden');
        } finally {
            linkRepoBtn.disabled = false;
            linkRepoBtn.textContent = 'Save & Link Repository';
        }
    });

    // 3. Navigation & Settings
    settingsBtn.addEventListener('click', () => showView('settings'));
    settingsBackBtn.addEventListener('click', () => showView('dashboard'));

    changeRepoBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove('target_repo');
        routeView();
    });

    logoutBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
            chrome.storage.local.remove(['github_token', 'github_user', 'target_repo'], () => {
                showView('login');
            });
        });
    });

    // Placeholder for bulk sync trigger
    bulkSyncBtn.addEventListener('click', () => {
        bulkSyncBtn.disabled = true;
        syncStatus.textContent = 'Initializing bulk sync...';
        chrome.runtime.sendMessage({ type: 'START_BULK_SYNC' });
    });

    // Listen for progress broadcast from background
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'BULK_SYNC_PROGRESS') {
            bulkSyncBtn.disabled = true;
            syncStatus.textContent = message.status;
            if (message.percent !== undefined) {
                bulkSyncBtn.textContent = `Syncing (${message.percent}%)`;
            }
        }

        if (message.type === 'BULK_SYNC_COMPLETE') {
            bulkSyncBtn.disabled = false;
            bulkSyncBtn.textContent = 'Bulk Sync All Past Solves';
            syncStatus.textContent = `✅ ${message.message}`;
        }

        if (message.type === 'BULK_SYNC_ERROR') {
            bulkSyncBtn.disabled = false;
            bulkSyncBtn.textContent = 'Retry Bulk Sync';
            syncStatus.textContent = `❌ ${message.error}`;
        }
    });
})