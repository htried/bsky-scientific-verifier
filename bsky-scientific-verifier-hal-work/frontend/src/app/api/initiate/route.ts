import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL}/initiate`);
    const data = await response.json();
    
    if (response.ok) {
      return NextResponse.json({ authUrl: data.authUrl });
    } else {
      return NextResponse.json({ error: data.error }, { status: response.status });
    }
  } catch (error) {
    console.error('Failed to initiate verification:', error);
    return NextResponse.json(
      { error: 'Failed to initiate verification' },
      { status: 500 }
    );
  }
} 