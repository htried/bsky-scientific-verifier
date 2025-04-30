import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  if (!handle) {
    return NextResponse.json(
      { error: 'Handle is required' },
      { status: 400 }
    );
  }

  try {
    console.log('Resolving handle:', handle);
    const response = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      console.error('Failed to resolve handle:', response.statusText);
      return NextResponse.json(
        { error: 'Failed to resolve handle' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Resolved DID:', data.did);
    
    return NextResponse.json({ did: data.did });
  } catch (error) {
    console.error('Failed to resolve handle:', error);
    return NextResponse.json(
      { error: 'Failed to resolve handle' },
      { status: 500 }
    );
  }
} 