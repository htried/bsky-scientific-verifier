'use client';

import { useState, useEffect } from 'react';
import { initiateBlueskyAuth } from '@/lib/bluesky-auth';

interface OrcidData {
  id: string;
  name: string;
  institutions: string[];
  numPublications: number;
}

export default function Home() {
  const [orcidData, setOrcidData] = useState<OrcidData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for URL parameters on initial load
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    
    // Check for ORCID data
    const orcidId = searchParams.get('orcidId');
    if (orcidId) {
      const institutionsParam = searchParams.get('institutions');
      const institutions = institutionsParam ? JSON.parse(institutionsParam) : [];
      
      setOrcidData({
        id: orcidId,
        name: searchParams.get('name') || '',
        institutions: Array.isArray(institutions) ? institutions : [],
        numPublications: parseInt(searchParams.get('numPublications') || '0')
      });
    }

    // Check for error
    const errorMessage = searchParams.get('error');
    if (errorMessage) {
      setError(errorMessage);
    }
  }, []);

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
    <main className="min-h-screen bg-gray-900 container-padding py-12">
      <div className="content-container">
        <h1 className="text-4xl font-bold mb-12 text-center text-white">
          Atproto Scientific Verifier
        </h1>
        
        <div className="card mb-8">
          <h2 className="text-2xl font-semibold mb-6 text-white text-center">About This Tool</h2>
          <p className="text-gray-300 mb-6 leading-relaxed text-center">
            This tool helps verify your scientific credentials on Bluesky. The process involves two main steps:
          </p>
          <ol className="space-y-4 text-gray-300">
            <li className="card-section">
              <span className="font-medium text-blue-400">ORCID Verification:</span>
              <span className="ml-2">Connect your ORCID account to verify your academic identity, publications, and affiliations.</span>
            </li>
            <li className="card-section">
              <span className="font-medium text-blue-400">Bluesky Connection:</span>
              <span className="ml-2">Link your verified academic identity to your Bluesky account.</span>
            </li>
          </ol>
          <p className="text-gray-300 mt-6 leading-relaxed text-center">
            Once verified, your Bluesky profile will be marked as belonging to a verified academic, 
            helping others identify credible scientific voices on the platform.
          </p>
        </div>
        
        {error && (
          <div className="mb-8 p-6 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-center">
            {error}
          </div>
        )}

        <div className="card">
          <h2 className="text-2xl font-semibold mb-6 text-white text-center">Step 1: Connect ORCID</h2>
          <p className="text-gray-300 mb-8 leading-relaxed text-center">
            Start by connecting your ORCID account. This will verify your academic identity, 
            including your publications and institutional affiliations.
          </p>
          
            {orcidData ? (
            <div className="space-y-6">
              <div className="card-section">
                <p className="text-gray-300">ID: <span className="text-blue-400 font-mono">{orcidData.id}</span></p>
                <p className="text-gray-300">Name: <span className="text-blue-400">{orcidData.name}</span></p>
              </div>
              
              {orcidData.institutions.length > 0 && (
                <div className="card-section">
                  <h3 className="font-medium text-gray-200 mb-3">Institutions:</h3>
                  <p className="text-gray-300">
                    {Array.isArray(orcidData.institutions) 
                      ? orcidData.institutions.join(', ')
                      : orcidData.institutions}
                  </p>
                </div>
              )}
              
              <div className="card-section">
                <p className="text-gray-300">Publications: <span className="text-blue-400">{orcidData.numPublications}</span></p>
              </div>
              
              <p className="text-gray-300 text-center mt-6">
                ✓ ORCID verification complete. Proceed to connect your Bluesky account.
              </p>
              </div>
            ) : (
            <button onClick={handleOrcidAuth} className="btn-primary">
              Connect ORCID
              </button>
            )}
        </div>
      </div>
    </main>
  );
}
