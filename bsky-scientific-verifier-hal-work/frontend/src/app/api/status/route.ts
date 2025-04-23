import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const verificationId = searchParams.get('verification_id');
    
    if (!verificationId) {
      return NextResponse.json(
        { error: 'Missing verification_id parameter' },
        { status: 400 }
      );
    }
    
    const response = await fetch(
      `${process.env.API_BASE_URL}/status?verification_id=${verificationId}`
    );
    const data = await response.json();
    
    if (response.ok) {
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ error: data.error }, { status: response.status });
    }
  } catch (error) {
    console.error('Failed to check status:', error);
    return NextResponse.json(
      { error: 'Failed to check verification status' },
      { status: 500 }
    );
  }
} 