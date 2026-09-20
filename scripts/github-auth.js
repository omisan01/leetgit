//GitHub OAuth App's Client ID
export const CLIENT_ID = 'Ov23liWBPQy8PJHOvTPQ';

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * Step 1: Request user code and verification URL from GitHub.
 */
export async function initiateDeviceFlow() {
    const response = await fetch(GITHUB_DEVICE_CODE_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            scope: 'public_repo'
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to request device code: ${response.statusText}`);
    }

    // Returns: { device_code, user_code, verification_uri, expires_in, interval }
    return await response.json();
}

/**
 * Step 2: Poll GitHub until the user authorizes the app.
 */
export async function pollForAccessToken(deviceCode, initialInterval = 5) {
    let interval = initialInterval;

    while (true) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));

        const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
        });

        const data = await response.json();

        if (data.access_token) {
            return data.access_token;
        }

        if (data.error) {
            switch (data.error) {
                case 'authorization_pending':
                    // User hasn't finished typing the code yet; continue loop
                    break;
                case 'slow_down':
                    // GitHub asks to back off by 5 seconds
                    interval += 5;
                    break;
                case 'expired_token':
                    throw new Error('Device code expired. Please restart login.');
                case 'access_denied':
                    throw new Error('Access was denied by the user.');
                default:
                    throw new Error(`Auth error: ${data.error_description || data.error}`);
            }
        }
    }
}