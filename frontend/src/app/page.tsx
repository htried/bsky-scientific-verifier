'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';

interface OrcidData {
  id: string;
  name: string;
  institutions: string[];
  numPublications: number;
  publicationYears?: number[];
  publicationTypes?: string[];
  publicationTitles?: string[];
  publicationJournals?: string[];
}

export default function Home() {
  const [orcidData, setOrcidData] = useState<OrcidData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check for URL parameters on initial load
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    
    // Check for ORCID data
    const orcidId = searchParams.get('orcidId');
    if (orcidId) {
      const institutionsParam = searchParams.get('institutions');
      const institutions = institutionsParam ? JSON.parse(institutionsParam) : [];
      
      // Parse publication data
      const publicationYearsParam = searchParams.get('publicationYears');
      const publicationTypesParam = searchParams.get('publicationTypes');
      const publicationTitlesParam = searchParams.get('publicationTitles');
      const publicationJournalsParam = searchParams.get('publicationJournals');

      const publicationYears = publicationYearsParam ? JSON.parse(publicationYearsParam) : [];
      const publicationTypes = publicationTypesParam ? JSON.parse(publicationTypesParam) : [];
      const publicationTitles = publicationTitlesParam ? JSON.parse(publicationTitlesParam) : [];
      const publicationJournals = publicationJournalsParam ? JSON.parse(publicationJournalsParam) : [];
      
      setOrcidData({
        id: orcidId,
        name: searchParams.get('name') || '',
        institutions: Array.isArray(institutions) ? institutions : [],
        numPublications: parseInt(searchParams.get('numPublications') || '0'),
        publicationYears,
        publicationTypes,
        publicationTitles,
        publicationJournals
      });

      // If we have ORCID data, redirect to verify page with all parameters
      const verifyParams = new URLSearchParams({
        orcidId,
        name: searchParams.get('name') || '',
        institutions: JSON.stringify(institutions),
        numPublications: searchParams.get('numPublications') || '0',
        status: 'pending_bluesky',
        publicationYears: JSON.stringify(publicationYears),
        publicationTypes: JSON.stringify(publicationTypes),
        publicationTitles: JSON.stringify(publicationTitles),
        publicationJournals: JSON.stringify(publicationJournals)
      });

      router.push(`/verify?${verifyParams.toString()}`);
    }

    // Check for error
    const errorMessage = searchParams.get('error');
    if (errorMessage) {
      setError(errorMessage);
    }
  }, [router]);

  const handleOrcidAuth = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error('API URL not configured');
      
      // Use our API Gateway endpoint
      const response = await fetch(`${apiUrl}/oauth/authorize?provider=orcid`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initiate ORCID authentication');
      }

      // Get the authorization URL from the response
      const data = await response.json();
      if (!data.authUrl) {
        throw new Error('No authorization URL in response');
      }

      // Redirect to the authorization URL
      window.location.href = data.authUrl;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start ORCID authentication');
    }
  };

  return (
    <div className="min-vh-100 bg-light py-5">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
            <div className="card shadow-sm mb-4">
              <div className="card-body">
                <h1 className="text-center mb-4">Bluesky Scientific Verifier</h1>
                <p className="text-center text-muted mb-4">
                  This tool helps import your scientific credentials into Bluesky from trusted, verified third-party sources. The process involves two main steps:
                </p>
                <ol className="list-group list-group-numbered mb-4">
                  <li className="list-group-item">
                    <span className="fw-bold text-primary">ORCID Verification: </span>
                    Connect your ORCID account to verify your academic identity, publications, and affiliations.
                  </li>
                  <li className="list-group-item">
                    <span className="fw-bold text-primary">Bluesky Connection: </span>
                    Link your verified academic identity to your Bluesky account.
                  </li>
                </ol>
                <p className="text-center text-muted">
                  Once verified, your Bluesky profile will be marked as belonging to a verified academic, 
                  helping others identify credible scientific voices on the platform.
                </p>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger mb-4" role="alert">
                {error}
              </div>
            )}

            <div className="card shadow-sm">
              <div className="card-body">
                <h2 className="text-center h4 mb-4">Step 1: Connect ORCID</h2>
                <p className="text-center text-muted mb-4">
                  Start by connecting your ORCID account. This will verify your academic identity, 
                  including your publications and institutional affiliations.
                </p>
                
                {orcidData ? (
                  <div className="bg-light p-4 rounded">
                    <div className="mb-3">
                      <p className="mb-1">ID: <code className="text-primary">{orcidData.id}</code></p>
                      <p className="mb-0">Name: <span className="text-primary">{orcidData.name}</span></p>
                    </div>
                    
                    {orcidData.institutions.length > 0 && (
                      <div className="mb-3">
                        <h3 className="h6 mb-2">Institutions:</h3>
                        <p className="text-muted mb-0">
                          {Array.isArray(orcidData.institutions) 
                            ? orcidData.institutions.join(', ')
                            : orcidData.institutions}
                        </p>
                      </div>
                    )}
                    
                    <div className="mb-3">
                      <p className="text-muted mb-0">Publications: <span className="text-primary">{orcidData.numPublications}</span></p>
                    </div>
                    
                    <p className="text-success text-center mb-0">
                      ✓ ORCID verification complete. Proceed to connect your Bluesky account.
                    </p>
                  </div>
                ) : (
                  <button 
                    onClick={handleOrcidAuth} 
                    className="btn btn-primary w-100"
                  >
                    Connect ORCID
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
