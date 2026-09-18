(function interceptLeetCode() {
    console.log('[LeetGit] Submission interceptor active in page context');
    const pendingSubmissions = new Map();

    // Helper to extract slug from URL
    function extractSlug(url) {
        const match = url.match(/\/problems\/([^/]+)\/submit\/?/);
        return match ? match[1] : '';
    }

    // --- 1. INTERCEPT FETCH ---
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        let url = '';
        let method = 'GET';
        let body = null;

        if (typeof args[0] === 'string') {
            url = args[0];
            method = args[1]?.method || 'GET';
            body = args[1]?.body;
        } else if (args[0] instanceof Request) {
            url = args[0].url;
            method = args[0].method;
            // Clone request to safely read body if needed
            try {
                const reqClone = args[0].clone();
                body = await reqClone.text();
            } catch (_) { }
        }

        // Capture Submit call
        if (url.includes('/submit/') && method.toUpperCase() === 'POST') {
            console.log('[LeetGit] Intercepted submit request to:', url);
            const slug = extractSlug(url);
            let parsedBody = {};
            try {
                parsedBody = typeof body === 'string' ? JSON.parse(body) : (body || {});
            } catch (_) { }

            const response = await originalFetch.apply(this, args);
            const clone = response.clone();

            clone.json().then((data) => {
                if (data?.submission_id) {
                    console.log('[LeetGit] Submission registered with ID:', data.submission_id);
                    pendingSubmissions.set(String(data.submission_id), {
                        slug,
                        code: parsedBody.typed_code || '',
                        lang: parsedBody.lang || ''
                    });
                }
            }).catch(() => { });

            return response;
        }

        // Capture Check polling call
        if (url.includes('/check/')) {
            const response = await originalFetch.apply(this, args);
            const clone = response.clone();

            clone.json().then((data) => {
                handleCheckResponse(url, data);
            }).catch(() => { });

            return response;
        }

        return originalFetch.apply(this, args);
    };

    // --- 2. INTERCEPT XHR (Fallback) ---
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._url = url;
        this._method = method;
        return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (body) {
        if (this._url && this._url.includes('/submit/') && this._method === 'POST') {
            const slug = extractSlug(this._url);
            let parsedBody = {};
            try { parsedBody = JSON.parse(body); } catch (_) { }

            this.addEventListener('load', () => {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data?.submission_id) {
                        console.log('[LeetGit XHR] Submission ID:', data.submission_id);
                        pendingSubmissions.set(String(data.submission_id), {
                            slug,
                            code: parsedBody.typed_code || '',
                            lang: parsedBody.lang || ''
                        });
                    }
                } catch (_) { }
            });
        }

        if (this._url && this._url.includes('/check/')) {
            this.addEventListener('load', () => {
                try {
                    const data = JSON.parse(this.responseText);
                    handleCheckResponse(this._url, data);
                } catch (_) { }
            });
        }

        return originalSend.apply(this, [body]);
    };

    function handleCheckResponse(url, data) {
        if (data?.state === 'SUCCESS' && (data.status_code === 10 || data.status_msg === 'Accepted')) {
            const match = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
            const submissionId = match ? match[1] : (data.submission_id ? String(data.submission_id) : null);

            console.log('[LeetGit] Accepted solve confirmed for ID:', submissionId);
            const submissionData = pendingSubmissions.get(submissionId);

            if (submissionData) {
                window.postMessage({
                    type: 'LEETGIT_ACCEPTED',
                    payload: {
                        submissionId,
                        slug: submissionData.slug,
                        code: submissionData.code,
                        lang: submissionData.lang,
                        runtime: data.status_runtime || `${data.runtime || 'N/A'}`,
                        runtimePercentile: data.runtime_percentile ? data.runtime_percentile.toFixed(2) : null,
                        memory: data.status_memory || `${data.memory || 'N/A'}`,
                        memoryPercentile: data.memory_percentile ? data.memory_percentile.toFixed(2) : null
                    }
                }, '*');

                pendingSubmissions.delete(submissionId);
            }
        }
    }
})();