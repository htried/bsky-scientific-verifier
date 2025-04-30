import { NextResponse } from 'next/server';

export async function GET() {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    console.error('API URL not configured');
    return NextResponse.json({ error: 'API URL not configured' }, { status: 500 });
  }

  try {
    console.log('Making request to:', `${apiUrl}/oauth/authorize?provider=orcid`);
    const response = await fetch(`${apiUrl}/oauth/authorize?provider=orcid`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://bsky-scientific-verifier.vercel.app'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to initiate ORCID authentication:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Failed to initiate ORCID authentication: ${errorText}`);
    }

    // The response should be a redirect
    const location = response.headers.get('location');
    if (!location) {
      throw new Error('No redirect URL in response');
    }

    console.log('Redirect URL:', location);
    return NextResponse.json({ authUrl: location });
  } catch (error) {
    console.error('Failed to initiate ORCID authentication:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate ORCID authentication' },
      { status: 500 }
    );
  }
} 