import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
            return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
        }

        if (!code || !state) {
            return NextResponse.redirect(new URL('/?error=Missing required parameters', request.url));
        }

        // Forward the callback to our backend
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/oauth/callback?code=${code}&state=${state}&provider=atproto&iss=https://bsky.social`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorData.error || 'Failed to handle Bluesky callback')}`, request.url));
        }

        const data = await response.json();
        
        // Get the ORCID data from the backend response
        const orcidId = data.orcidId;
        const name = data.name;
        const institutions = data.institutions;
        const numPublications = data.numPublications;
        
        if (!orcidId || !name || !institutions || !numPublications) {
            console.error('Missing ORCID data in response:', data);
            return NextResponse.redirect(new URL('/?error=Missing ORCID data in response', request.url));
        }

        // Redirect to the verified page with all the data
        const redirectUrl = new URL('/verified', process.env.NEXT_PUBLIC_APP_URL);
        redirectUrl.searchParams.set('orcidId', orcidId);
        redirectUrl.searchParams.set('name', name);
        redirectUrl.searchParams.set('institutions', JSON.stringify(institutions));
        redirectUrl.searchParams.set('numPublications', numPublications.toString());
        redirectUrl.searchParams.set('status', 'verified');
        redirectUrl.searchParams.set('handle', data.handle);
        redirectUrl.searchParams.set('did', data.did);

        return NextResponse.redirect(redirectUrl);
    } catch (error) {
        console.error('Error handling Bluesky callback:', error);
        return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to handle Bluesky callback')}`, request.url));
    }
}

export async function POST(request: NextRequest) {
    try {
        const { provider, code, state, verification_id } = await request.json();

        if (!provider || !code || !state || !verification_id) {
            return NextResponse.json(
                { error: 'Provider, code, state, and verification_id are required' },
                { status: 400 }
            );
        }

        if (provider !== 'atproto') {
            return NextResponse.json(
                { error: 'Invalid provider' },
                { status: 400 }
            );
        }

        // Call Lambda function for Bluesky OAuth callback
        const response = await fetch(process.env.OAUTH_LAMBDA_URL!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'callback',
                code,
                state,
                verification_id,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to handle Bluesky OAuth callback');
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error handling Bluesky callback:', error);
        return NextResponse.json(
            { error: 'Failed to handle Bluesky callback' },
            { status: 500 }
        );
    }
} 