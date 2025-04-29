export async function initiateBlueskyAuth(handle: string): Promise<string> {
    const response = await fetch('/api/atproto/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to initiate Bluesky authentication');
    }

    const { authUrl } = await response.json();
    if (!authUrl) {
        throw new Error('No authorization URL in response');
    }

    return authUrl;
}

export async function handleBlueskyCallback(params: URLSearchParams) {
        const code = params.get('code');
        if (!code) {
            throw new Error('Authorization code not found in URL parameters');
        }

        const response = await fetch('/api/atproto/callback', {
            method: 'POST',
        headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });

        if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to handle Bluesky callback');
        }

    return response.json();
}

export async function getBlueskyProfile(did: string) {
        const response = await fetch(`/api/atproto/profile?did=${encodeURIComponent(did)}`);
    
        if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to get Bluesky profile');
        }

    return response.json();
} 