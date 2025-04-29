import { NextResponse } from 'next/server';

export async function GET() {
  console.log('Initiate route called');
  console.log('API URL:', process.env.API_URL);

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    console.error('API URL not configured');
    return NextResponse.json({ error: 'API URL not configured' }, { status: 500 });
  }

  try {
    console.log('Making request to:', `${apiUrl}/oauth/authorize`);
    const response = await fetch(`${apiUrl}/oauth/authorize?provider=orcid`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to initiate verification:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Failed to initiate verification: ${errorText}`);
    }

    // Get the base64 encoded response text
    const base64Response = await response.text();
    console.log('Base64 response:', base64Response);
    
    // Decode base64 to get the JSON string
    const jsonString = Buffer.from(base64Response, 'base64').toString('utf-8');
    console.log('Decoded JSON string:', jsonString);
    
    // Parse the JSON
    const data = JSON.parse(jsonString);
    console.log('Parsed data:', data);
    
    if (!data.authUrl) {
      console.error('No authorization URL in response');
      throw new Error('No authorization URL in response');
    }

    return NextResponse.json({ authUrl: data.authUrl });
  } catch (error) {
    console.error('Failed to initiate verification:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate verification' },
      { status: 500 }
    );
  }
} 