(async function autoFillDeviceCode() {
    // Retrieve the pending code from extension storage
    const { auth_state } = await chrome.storage.local.get('auth_state');

    if (!auth_state || auth_state.status !== 'pending' || !auth_state.user_code) {
        return;
    }

    const rawCode = auth_state.user_code.trim(); // e.g. "WDJB-MJHT"
    const cleanCode = rawCode.replace(/[^a-zA-Z0-9]/g, '');

    let attempts = 0;
    const maxAttempts = 20;

    // Poll for up to 5 seconds to ensure GitHub's form has loaded
    const interval = setInterval(() => {
        attempts++;

        // Try standard single input
        const singleInput = document.querySelector(
            'input[name="user_code"], #user_code, input[autocomplete="one-time-code"]'
        );

        // Try split/multi-box inputs if present
        const splitInputs = document.querySelectorAll('input.js-user-code-char, input[data-index]');

        if (singleInput) {
            clearInterval(interval);
            fillSingleInput(singleInput, rawCode);
            clickSubmit();
        } else if (splitInputs && splitInputs.length > 0) {
            clearInterval(interval);
            fillSplitInputs(splitInputs, cleanCode);
            clickSubmit();
        } else {
            // Fallback: any text input in GitHub's device auth form
            const fallbackInput = document.querySelector('main form input[type="text"]');
            if (fallbackInput) {
                clearInterval(interval);
                fillSingleInput(fallbackInput, rawCode);
                clickSubmit();
            }
        }

        if (attempts >= maxAttempts) {
            clearInterval(interval);
        }
    }, 250);

    function fillSingleInput(input, code) {
        input.focus();
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Also trigger paste event in case GitHub's component listens for paste
        try {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', code);
            input.dispatchEvent(new ClipboardEvent('paste', {
                clipboardData: dataTransfer,
                bubbles: true,
                cancelable: true
            }));
        } catch (_) { }
    }

    function fillSplitInputs(inputs, codeChars) {
        inputs.forEach((inp, idx) => {
            if (idx < codeChars.length) {
                inp.focus();
                inp.value = codeChars[idx];
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    function clickSubmit() {

    }
})();