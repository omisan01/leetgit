console.log('[LeetGit] Content script listener ready');

window.addEventListener('message', (event) => {
    // Only accept messages from same origin and matching our type
    if (event.source !== window || event.data?.type !== 'LEETGIT_ACCEPTED') return;

    const submission = event.data.payload;
    console.log('[LeetGit Content] Received accepted event:', submission);

    showToast('syncing', `Syncing ${submission.slug}...`);

    chrome.runtime.sendMessage({
        type: 'SYNC_SUBMISSION',
        data: submission
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[LeetGit] Runtime error:', chrome.runtime.lastError);
            showToast('error', chrome.runtime.lastError.message);
            return;
        }

        if (response?.success) {
            showToast('success', `Synced ${response.title} to GitHub!`);
        } else {
            showToast('error', `Sync failed: ${response?.error || 'Unknown error'}`);
        }
    });
});

function showToast(status, message) {
    let toast = document.getElementById('leetgit-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'leetgit-toast';
        toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      padding: 12px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
        document.body.appendChild(toast);
    }

    if (status === 'syncing') {
        toast.style.background = '#1e293b';
        toast.style.color = '#f8fafc';
        toast.textContent = `⏳ ${message}`;
    } else if (status === 'success') {
        toast.style.background = '#15803d';
        toast.style.color = '#ffffff';
        toast.textContent = `✅ ${message}`;
        setTimeout(() => toast.remove(), 4000);
    } else {
        toast.style.background = '#b91c1c';
        toast.style.color = '#ffffff';
        toast.textContent = `❌ ${message}`;
        setTimeout(() => toast.remove(), 6000);
    }
}