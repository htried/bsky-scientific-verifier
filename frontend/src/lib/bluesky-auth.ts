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

export async function addBlueskyLabels(handle: string, did: string, data: any) {
  const response = await fetch('/api/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add',
      handle,
      did,
      data
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to add labels');
  }

  return response.json();
}

export async function removeBlueskyLabels(handle: string, did: string, orcidId: string) {
  const response = await fetch('/api/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'remove',
      handle,
      did,
      orcidId
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to remove labels');
  }

  return response.json();
} 