'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface VerificationData {
  orcidId: string;
  name: string;
  institutions: string[];
  numPublications: number;
  status: string;
  publicationYears?: number[];
  publicationTypes?: string[];
  publicationTitles?: string[];
  publicationJournals?: string[];
}

export default function VerifyPage() {
  const [verificationData, setVerificationData] = useState<VerificationData>({
    orcidId: '',
    name: '',
    institutions: [],
    numPublications: 0,
    status: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    
    const orcidId = searchParams.get('orcidId');
    const name = searchParams.get('name');
    const institutionsParam = searchParams.get('institutions');
    const numPublications = searchParams.get('numPublications');
    const status = searchParams.get('status');
    const publicationYearsParam = searchParams.get('publicationYears');
    const publicationTypesParam = searchParams.get('publicationTypes');
    const publicationTitlesParam = searchParams.get('publicationTitles');
    const publicationJournalsParam = searchParams.get('publicationJournals');

    if (!orcidId || !name || !numPublications || !status) {
      setError('Missing required verification data');
      return;
    }

    const institutions = institutionsParam ? JSON.parse(institutionsParam) : [];
    const publicationYears = publicationYearsParam ? JSON.parse(publicationYearsParam) : [];
    const publicationTypes = publicationTypesParam ? JSON.parse(publicationTypesParam) : [];
    const publicationTitles = publicationTitlesParam ? JSON.parse(publicationTitlesParam) : [];
    const publicationJournals = publicationJournalsParam ? JSON.parse(publicationJournalsParam) : [];

    setVerificationData({
      orcidId,
      name,
      institutions,
      numPublications: parseInt(numPublications),
      status,
      publicationYears,
      publicationTypes,
      publicationTitles,
      publicationJournals
    });
  }, []);

  const handleBlueskyAuth = () => {
    if (!verificationData || !handle) {
      setError('Please enter your Bluesky handle');
      return;
    }
    
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setError('API URL not configured');
      return;
    }

    // Redirect to the Bluesky authorization flow with the state
    window.location.href = `${apiUrl}/oauth/authorize?provider=atproto&handle=${handle}&orcidId=${verificationData.orcidId}&name=${encodeURIComponent(verificationData.name)}&institutions=${encodeURIComponent(JSON.stringify(verificationData.institutions))}&numPublications=${verificationData.numPublications}`;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 container-padding py-12">
        <div className="content-container">
          <div className="card">
            <h2 className="text-xl font-semibold text-red-400 mb-4">Error</h2>
            <p className="text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="btn-primary"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!verificationData) {
    return (
      <div className="min-h-screen bg-gray-900 container-padding py-12">
        <div className="content-container">
          <div className="card">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 container-padding py-12">
      <div className="content-container">
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Step 2: Connect Bluesky</h2>
          <p className="text-gray-300 mb-8 text-center leading-relaxed">
            Your ORCID verification is complete! Now, let's connect your Bluesky account to link your verified academic identity.
            This will allow others to verify your scientific credentials on Bluesky.
          </p>
          
          <div className="space-y-6">
            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Verified ORCID Profile</h3>
              <div className="space-y-2 bg-gray-800/50 p-4 rounded-lg ring-1 ring-gray-700 ring-inset">
                <p className="text-gray-300">ID: <span className="text-blue-400 font-mono">{verificationData.orcidId}</span></p>
                <p className="text-gray-300">Name: <span className="text-blue-400">{verificationData.name}</span></p>
              </div>
            </div>

            {verificationData.institutions && verificationData.institutions.length > 0 && (
              <div className="card-section">
                <h3 className="font-medium text-gray-200 mb-3">Institutions</h3>
                <div className="bg-gray-800/50 p-4 rounded-lg ring-1 ring-gray-700 ring-inset">
                  <p className="text-gray-300">
                    {typeof verificationData.institutions === 'string' 
                      ? verificationData.institutions 
                      : verificationData.institutions.join(', ')}
                  </p>
                </div>
              </div>
            )}

            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Publications</h3>
              <div className="bg-gray-800/50 p-4 rounded-lg ring-1 ring-gray-700 ring-inset">
                <p className="text-gray-300">{verificationData.numPublications} publications found</p>
                
                {verificationData.publicationYears && verificationData.publicationYears.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-200 mb-2">Publication Years</h4>
                    <p className="text-gray-300">
                      Earliest published work: {Math.min(...verificationData.publicationYears)}
                      <br />
                      Latest published work: {Math.max(...verificationData.publicationYears)}
                    </p>
                  </div>
                )}

                {verificationData.publicationTypes && verificationData.publicationTypes.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-200 mb-2">Publication Types</h4>
                    <p className="text-gray-300">
                      {verificationData.publicationTypes.join(', ')}
                    </p>
                  </div>
                )}

                {verificationData.publicationTitles && verificationData.publicationTitles.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-200 mb-2">Recent Publications</h4>
                    <ul className="space-y-2">
                      {verificationData.publicationTitles.slice(0, 5).map((title, index) => (
                        <li key={index} className="text-gray-300">
                          {title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {verificationData.publicationJournals && verificationData.publicationJournals.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-200 mb-2">Recent Publication Venues</h4>
                    <ul className="space-y-2">
                      {verificationData.publicationJournals.slice(0, 5).map((journal, index) => (
                        <li key={index} className="text-gray-300">
                          {journal}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Status</h3>
              <div className="bg-gray-800/50 p-4 rounded-lg ring-1 ring-gray-700 ring-inset">
                <p className="text-gray-300">{verificationData.status}</p>
              </div>
            </div>

            {verificationData.status === 'pending_bluesky' && (
              <div className="space-y-6">
                <div className="card-section">
                  <label htmlFor="bluesky-handle" className="block text-lg font-medium text-gray-200 mb-2">
                    Enter your Bluesky handle
                  </label>
                  <p className="text-gray-400 text-sm mb-4">
                    This is the account that will be linked to your verified academic identity.
                  </p>
                  <input
                    type="text"
                    id="bluesky-handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="e.g. your-handle.bsky.social"
                    className="input-field mb-4"
                  />
                  <button
                    onClick={handleBlueskyAuth}
                    className="btn-primary"
                  >
                    Connect Bluesky Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 