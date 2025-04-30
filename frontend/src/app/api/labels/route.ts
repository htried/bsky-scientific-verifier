import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { action, handle, did, data, orcidId } = await request.json();

    if (!action || !handle || !did) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (action === 'remove' && !orcidId) {
      return NextResponse.json(
        { error: 'ORCID ID is required for removing labels' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.API_URL;
    if (!apiUrl) {
      throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/labels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://bsky-scientific-verifier.vercel.app',
        'Authorization': `Bearer ${process.env.API_TOKEN}`
      },
      body: JSON.stringify({ action, handle, did, data, orcidId })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to handle labels:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Failed to handle labels: ${errorText}`);
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    console.error('Failed to handle labels:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to handle labels' },
      { status: 500 }
    );
  }
} 