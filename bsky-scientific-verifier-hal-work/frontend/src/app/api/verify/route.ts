import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(`${process.env.API_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    
    if (response.ok) {
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ error: data.error }, { status: response.status });
    }
  } catch (error) {
    console.error('Failed to submit verification:', error);
    return NextResponse.json(
      { error: 'Failed to submit verification' },
      { status: 500 }
    );
  }
} 