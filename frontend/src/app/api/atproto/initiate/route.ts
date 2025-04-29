import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { handle } = await request.json();

        if (!handle) {
            return NextResponse.json(
                { error: 'Handle is required' },
                { status: 400 }
            );
        }

        const apiUrl = process.env.API_URL;
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        console.log('Making request to:', `${apiUrl}/oauth/authorize?provider=atproto&handle=${handle}`);
        const response = await fetch(`${apiUrl}/oauth/authorize?provider=atproto&handle=${handle}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://bsky-scientific-verifier.vercel.app'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to initiate Bluesky authentication:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Failed to initiate Bluesky authentication: ${errorText}`);
        }

        // The response should be a redirect
        const location = response.headers.get('location');
        if (!location) {
            throw new Error('No redirect URL in response');
        }

        console.log('Redirect URL:', location);
        return NextResponse.json({ authUrl: location });
    } catch (error) {
        console.error('Failed to initiate Bluesky authentication:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to initiate Bluesky authentication' },
            { status: 500 }
        );
    }
} 