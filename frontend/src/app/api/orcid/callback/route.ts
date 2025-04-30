import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=Missing required parameters', request.url));
    }

    // Forward the callback to our backend
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/oauth/callback?code=${code}&state=${state}&provider=orcid`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorData.error || 'Failed to handle ORCID callback')}`, request.url));
    }

    const orcidData = await response.json();
    
    // Ensure institutions is an array
    const institutions = Array.isArray(orcidData.institutions) ? orcidData.institutions : [];
    
    // Redirect to the frontend with the ORCID data
    const redirectUrl = new URL('/verify', process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set('orcidId', orcidData.orcidId);
    redirectUrl.searchParams.set('name', orcidData.name);
    redirectUrl.searchParams.set('institutions', JSON.stringify(institutions));
    redirectUrl.searchParams.set('numPublications', orcidData.numPublications.toString());
    redirectUrl.searchParams.set('status', orcidData.status);
    redirectUrl.searchParams.set('publicationYears', JSON.stringify(orcidData.publicationYears || []));
    redirectUrl.searchParams.set('publicationTypes', JSON.stringify(orcidData.publicationTypes || []));
    redirectUrl.searchParams.set('publicationTitles', JSON.stringify(orcidData.publicationTitles || []));
    redirectUrl.searchParams.set('publicationJournals', JSON.stringify(orcidData.publicationJournals || []));

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Error handling ORCID callback:', error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to handle ORCID callback')}`, request.url));
  }
} 