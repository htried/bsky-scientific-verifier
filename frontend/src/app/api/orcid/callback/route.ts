import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const provider = searchParams.get('provider') || 'orcid';
    const iss = searchParams.get('iss') || 'https://orcid.org';

    console.log('Received ORCID callback with parameters:', {
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

    if (iss !== 'https://orcid.org') {
      return NextResponse.json(
        { error: `Invalid issuer. Expected 'https://orcid.org', got '${iss}'` },
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
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Failed to handle ORCID OAuth callback: ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error handling ORCID callback:', error);
    return NextResponse.json(
      { error: 'Failed to handle ORCID callback' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code, state, verification_id } = await request.json();
    const provider = 'orcid'; // Always set to orcid for this endpoint

    if (!code || !state || !verification_id) {
      return NextResponse.json(
        { error: 'Code, state, and verification_id are required' },
        { status: 400 }
      );
    }

    // Call FastAPI backend for ORCID OAuth callback
    const response = await fetch(`${process.env.API_URL}/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        code, 
        state, 
        verification_id,
        provider
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to handle ORCID OAuth callback');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error handling ORCID callback:', error);
    return NextResponse.json(
      { error: 'Failed to handle ORCID callback' },
      { status: 500 }
    );
  }
} 