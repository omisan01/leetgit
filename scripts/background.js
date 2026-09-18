import { initiateDeviceFlow, pollForAccessToken } from './github-auth.js';
import { commitFile } from './github-api.js';

const EXTENSIONS = {
    cpp: 'cpp',
    java: 'java',
    python: 'py',
    python3: 'py',
    c: 'c',
    csharp: 'cs',
    javascript: 'js',
    typescript: 'ts',
    php: 'php',
    swift: 'swift',
    kotlin: 'kt',
    golang: 'go',
    ruby: 'rb',
    scala: 'scala',
    rust: 'rs'
};

let isPolling = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_GITHUB_AUTH') {
        handleAuthStart(sendResponse);
        return true;
    }

    if (message.type === 'LOGOUT') {
        chrome.storage.local.remove(['github_token', 'github_user', 'auth_state', 'target_repo'], () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.type === 'SYNC_SUBMISSION') {
        handleAutoSync(message.data)
            .then((res) => sendResponse({ success: true, title: res.title }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'START_BULK_SYNC') {
        startBulkSync();
        sendResponse({ started: true });
        return true;
    }

    if (message.type === 'CHECK_SYNC_STATUS') {
        chrome.storage.local.get(['synced_ids', 'bulk_sync_progress'], (data) => {
            sendResponse(data);
        });
        return true;
    }

    if (message.type === 'GET_DASHBOARD_STATS') {
        (async () => {
            const { problem_catalog = {} } = await chrome.storage.local.get('problem_catalog');
            const syncedCount = Object.keys(problem_catalog).length;
            const leetcode = await getLeetCodeStats();

            sendResponse({
                syncedCount,
                totalSolved: leetcode.totalSolved,
                isSignedIn: leetcode.isSignedIn,
                username: leetcode.username
            });
        })();
        return true;
    }
});

async function handleAuthStart(sendResponse) {
    if (isPolling) {
        sendResponse({ error: 'Authentication already in progress' });
        return;
    }

    try {
        const authData = await initiateDeviceFlow();

        // Store pending status so popup can resume display if reopened
        await chrome.storage.local.set({
            auth_state: {
                status: 'pending',
                user_code: authData.user_code,
                verification_uri: authData.verification_uri
            }
        });

        // Notify the popup UI with code to display
        sendResponse({ success: true, data: authData });

        // Open GitHub authorization page directly in a new tab
        chrome.tabs.create({ url: authData.verification_uri });

        // Begin polling in background
        isPolling = true;
        const token = await pollForAccessToken(authData.device_code, authData.interval);

        // Fetch user details to verify token works
        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const userData = await userRes.json();

        // Save token and profile in storage
        await chrome.storage.local.set({
            github_token: token,
            github_user: {
                login: userData.login,
                avatar_url: userData.avatar_url
            },
            auth_state: { status: 'authenticated' }
        });

        // Create a native browser notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon.svg',
            title: 'LeetGit Connected',
            message: `Successfully connected as @${userData.login}!`
        });

    } catch (err) {
        console.error('GitHub Auth Failed:', err);
        await chrome.storage.local.set({
            auth_state: { status: 'failed', error: err.message }
        });
    } finally {
        isPolling = false;
    }
}

async function getLeetCodeStats() {
    // Check sign-in status and get username
    const statusRes = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query globalData { userStatus { isSignedIn username } }`
        })
    });
    const statusJson = await statusRes.json();
    const userStatus = statusJson?.data?.userStatus;

    if (!userStatus?.isSignedIn || !userStatus?.username) {
        return { isSignedIn: false, totalSolved: 0 };
    }

    // Fetch total accepted problems count
    const statsRes = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `
        query userProblemsSolved($username: String!) {
          matchedUser(username: $username) {
            submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
        }
      `,
            variables: { username: userStatus.username }
        })
    });

    const statsJson = await statsRes.json();
    const acStats = statsJson?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum || [];
    const allEntry = acStats.find((item) => item.difficulty === 'All');

    return {
        isSignedIn: true,
        username: userStatus.username,
        totalSolved: allEntry ? allEntry.count : 0
    };
}

// --- 2. ROOT README GENERATOR ---

async function updateRootReadme(targetRepo) {
    const { problem_catalog = {} } = await chrome.storage.local.get('problem_catalog');
    const problems = Object.values(problem_catalog);

    if (problems.length === 0) return;

    // Sort numerically by question frontend ID (e.g., 1, 2, 15, 100)
    problems.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    let easyCount = 0;
    let mediumCount = 0;
    let hardCount = 0;

    const rows = problems.map((p) => {
        if (p.difficulty === 'Easy') easyCount++;
        else if (p.difficulty === 'Medium') mediumCount++;
        else if (p.difficulty === 'Hard') hardCount++;

        const solLinks = Object.entries(p.solutions)
            .map(([lang, path]) => `[${lang}](./${path})`)
            .join(', ');

        return `| ${p.id.padStart(4, '0')} | [${p.title}](https://leetcode.com/problems/${p.slug}/) | ${solLinks} | \`${p.difficulty}\` |`;
    }).join('\n');

    const content = `# LeetCode Solutions

Synced automatically using [LeetGit](https://github.com).

### Progress Summary
- **Total Solved:** ${problems.length}
- **Easy:** ${easyCount} | **Medium:** ${mediumCount} | **Hard:** ${hardCount}

---

### Solved Problems

| # | Title | Solution | Difficulty |
| :---: | :--- | :---: | :---: |
${rows}
`;

    await commitFile(
        targetRepo.full_name,
        targetRepo.default_branch,
        'README.md',
        content,
        `docs: update root index table (${problems.length} solved)`
    );
}

// Helper to record a solution into local storage catalog
async function recordSolutionInCatalog(question, slug, lang, filePath) {
    const { problem_catalog = {} } = await chrome.storage.local.get('problem_catalog');

    if (!problem_catalog[slug]) {
        problem_catalog[slug] = {
            id: String(question.questionFrontendId),
            title: question.title,
            slug: slug,
            difficulty: question.difficulty,
            solutions: {}
        };
    }

    problem_catalog[slug].solutions[lang] = filePath;
    await chrome.storage.local.set({ problem_catalog });
}

async function handleAutoSync(sub) {
    const { target_repo } = await chrome.storage.local.get('target_repo');
    if (!target_repo) throw new Error('No repository linked');

    const question = await fetchQuestionDetails(sub.slug);
    const paddedId = String(question.questionFrontendId).padStart(4, '0');
    const folderName = `${paddedId}-${sub.slug}`;
    const ext = EXTENSIONS[sub.lang.toLowerCase()] || 'txt';
    const solutionPath = `${folderName}/solution.${ext}`;

    // 1. Commit Problem README.md
    const readmeContent = `## [${question.questionFrontendId}. ${question.title}](https://leetcode.com/problems/${sub.slug}/)\n\n**Difficulty:** ${question.difficulty}\n\n---\n\n${question.content || 'No description available.'}`;
    await commitFile(
        target_repo.full_name,
        target_repo.default_branch,
        `${folderName}/README.md`,
        readmeContent,
        `docs: add description for ${question.title}`
    );

    // 2. Commit Solution File
    const statsLine = `Time: ${sub.runtime} (${sub.runtimePercentile || 0}%) | Memory: ${sub.memory} (${sub.memoryPercentile || 0}%)`;
    await commitFile(
        target_repo.full_name,
        target_repo.default_branch,
        solutionPath,
        `// Solution: ${question.title}\n// ${statsLine}\n\n${sub.code}`,
        `sync: ${question.title} [${sub.runtime}]`
    );

    // 3. Update Catalog and Root README.md
    await recordSolutionInCatalog(question, sub.slug, sub.lang, solutionPath);
    await updateRootReadme(target_repo);

    const { synced_ids = [] } = await chrome.storage.local.get('synced_ids');
    if (!synced_ids.includes(String(sub.submissionId))) {
        synced_ids.push(String(sub.submissionId));
        await chrome.storage.local.set({ synced_ids });
    }

    return { title: question.title };
}
async function fetchQuestionDetails(titleSlug) {
    const query = `
    query questionDetails($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        titleSlug
        difficulty
        content
      }
    }
  `;

    const response = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { titleSlug } })
    });

    const json = await response.json();
    return json?.data?.question || {
        questionFrontendId: '0000',
        title: titleSlug,
        difficulty: 'Unknown',
        content: ''
    };
}

/**
 * 1. Paginates through all past submissions from LeetCode GraphQL
 */
async function fetchAllAcceptedSubmissions() {
    const pageSize = 20;
    let offset = 0;
    let hasNext = true;
    const acceptedMap = new Map(); // key: `${titleSlug}_${lang}` -> submission metadata

    const query = `
    query getSubmissions($offset: Int!, $limit: Int!) {
      submissionList(offset: $offset, limit: $limit) {
        hasNext
        submissions {
          id
          titleSlug
          statusDisplay
          lang
        }
      }
    }
  `;

    while (hasNext) {
        const res = await fetch('https://leetcode.com/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { offset, limit: pageSize } })
        });

        const data = await res.json();
        const list = data?.data?.submissionList;

        if (!list || !list.submissions) break;

        for (const sub of list.submissions) {
            if (sub.statusDisplay === 'Accepted') {
                const key = `${sub.titleSlug}_${sub.lang}`;
                // Keep the latest submission encountered for each slug + lang combination
                if (!acceptedMap.has(key)) {
                    acceptedMap.set(key, sub);
                }
            }
        }

        hasNext = list.hasNext;
        offset += pageSize;

        // Report discovery progress to popup
        chrome.runtime.sendMessage({
            type: 'BULK_SYNC_PROGRESS',
            status: `Scanning history: discovered ${acceptedMap.size} unique solves...`
        }).catch(() => { });
    }

    return Array.from(acceptedMap.values());
}

/**
 * 2. Fetches code and problem details for a single historical submission
 */
async function fetchSubmissionDetails(submissionId) {
    const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtimeDisplay
        runtimePercentile
        memoryDisplay
        memoryPercentile
        code
        lang {
          name
        }
        question {
          questionFrontendId
          title
          titleSlug
          content
          difficulty
        }
      }
    }
  `;

    const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { submissionId: parseInt(submissionId, 10) } })
    });

    const data = await res.json();
    return data?.data?.submissionDetails;
}

/**
 * 3. Master Bulk Sync Orchestrator
 */
async function startBulkSync() {
    const { target_repo, synced_ids = [] } = await chrome.storage.local.get(['target_repo', 'synced_ids']);
    if (!target_repo) return;

    try {
        const allUniqueSolves = await fetchAllAcceptedSubmissions();

        // Filter out submissions already committed
        const toSync = allUniqueSolves.filter((sub) => !synced_ids.includes(String(sub.id)));

        if (toSync.length === 0) {
            chrome.runtime.sendMessage({
                type: 'BULK_SYNC_COMPLETE',
                message: 'All solves are already up to date!'
            }).catch(() => { });
            return;
        }

        let completed = 0;

        for (const item of toSync) {
            const details = await fetchSubmissionDetails(item.id);
            if (details && details.question) {
                const q = details.question;
                const paddedId = String(q.questionFrontendId).padStart(4, '0');
                const folderName = `${paddedId}-${q.titleSlug}`;
                const ext = EXTENSIONS[details.lang.name.toLowerCase()] || 'txt';

                // 1. Problem README.md
                const readmeContent = `## [${q.questionFrontendId}. ${q.title}](https://leetcode.com/problems/${q.titleSlug}/)\n\n**Difficulty:** ${q.difficulty}\n\n---\n\n${q.content || 'No description provided.'}`;
                await commitFile(
                    target_repo.full_name,
                    target_repo.default_branch,
                    `${folderName}/README.md`,
                    readmeContent,
                    `docs: add description for ${q.title}`
                );

                // 2. Solution Code
                const statsHeader = `// Solution: ${q.title}\n// Runtime: ${details.runtimeDisplay || 'N/A'} | Memory: ${details.memoryDisplay || 'N/A'}\n\n`;
                await commitFile(
                    target_repo.full_name,
                    target_repo.default_branch,
                    `${folderName}/solution.${ext}`,
                    statsHeader + details.code,
                    `sync: ${q.title} (${details.lang.name})`
                );

                const solutionPath = `${folderName}/solution.${ext}`;
                await recordSolutionInCatalog(q, q.titleSlug, details.lang.name, solutionPath);

                synced_ids.push(String(item.id));
                await chrome.storage.local.set({ synced_ids });
            }

            completed++;

            // Send progress to popup
            chrome.runtime.sendMessage({
                type: 'BULK_SYNC_PROGRESS',
                status: `Syncing: ${completed}/${toSync.length} problems...`,
                percent: Math.round((completed / toSync.length) * 100)
            }).catch(() => { });

            // 250ms throttle delay to avoid GitHub abuse-rate limits
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        await updateRootReadme(target_repo);

        chrome.runtime.sendMessage({
            type: 'BULK_SYNC_COMPLETE',
            message: `Sync complete! Added ${completed} problems.`
        }).catch(() => { });

    } catch (err) {
        console.error('[LeetGit Bulk Sync Error]:', err);
        chrome.runtime.sendMessage({
            type: 'BULK_SYNC_ERROR',
            error: err.message
        }).catch(() => { });
    }
}
