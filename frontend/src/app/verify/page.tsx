'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface VerificationData {
  orcidId: string;
  name: string;
  institutions: string[];
  numPublications: number;
  status: string;
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

    if (!orcidId || !name || !numPublications || !status) {
      setError('Missing required verification data');
      return;
    }

    // Parse institutions from JSON string
    let institutions: string[] = [];
    try {
      if (institutionsParam) {
        const decoded = decodeURIComponent(institutionsParam);
        const parsed = JSON.parse(decoded);
        institutions = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error('Error parsing institutions:', e);
      institutions = [];
    }

    setVerificationData({
      orcidId,
      name,
      institutions,
      numPublications: parseInt(numPublications),
      status
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
              <div className="space-y-2">
                <p className="text-gray-300">ID: <span className="text-blue-400 font-mono">{verificationData.orcidId}</span></p>
                <p className="text-gray-300">Name: <span className="text-blue-400">{verificationData.name}</span></p>
              </div>
            </div>

            {verificationData.institutions && verificationData.institutions.length > 0 && (
              <div className="card-section">
                <h3 className="font-medium text-gray-200 mb-3">Institutions</h3>
                <p className="text-gray-300">
                  {typeof verificationData.institutions === 'string' 
                    ? verificationData.institutions 
                    : verificationData.institutions.join(', ')}
                </p>
              </div>
            )}

            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Publications</h3>
              <p className="text-gray-300">{verificationData.numPublications} publications found</p>
            </div>

            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Status</h3>
              <p className="text-gray-300">{verificationData.status}</p>
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