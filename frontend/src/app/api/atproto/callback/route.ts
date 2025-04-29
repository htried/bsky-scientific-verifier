import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const provider = searchParams.get('provider') || 'atproto';
        const iss = searchParams.get('iss') || 'https://bsky.social';

        console.log('Received callback with parameters:', {
            code: code ? 'present' : 'missing',
            state: state ? 'present' : 'missing',
            provider,
            iss: iss ? 'present' : 'missing'
        });

        if (!code || !state) {
            const missingParams = [];
            if (!code) missingParams.push('code');
            if (!state) missingParams.push('state');
            
            return NextResponse.json(
                { error: `Missing required parameters: ${missingParams.join(', ')}` },
                { status: 400 }
            );
        }

        if (iss !== 'https://bsky.social') {
            return NextResponse.json(
                { error: `Invalid issuer. Expected 'https://bsky.social', got '${iss}'` },
                { status: 400 }
            );
        }

        // Forward the request to AWS API Gateway
        const apiUrl = new URL('https://zpgkzlqawc.execute-api.us-east-1.amazonaws.com/prod/oauth/callback');
        
        // Add query parameters
        apiUrl.searchParams.append('code', code);
        apiUrl.searchParams.append('state', state);
        apiUrl.searchParams.append('provider', provider);
        apiUrl.searchParams.append('iss', iss);

        const response = await fetch(apiUrl.toString(), {
            method: 'POST',
            headers: {
                'host': 'zpgkzlqawc.execute-api.us-east-1.amazonaws.com',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                code,
                state,
                provider,
                iss
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Lambda function error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Failed to handle Bluesky OAuth callback: ${errorText}`);
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