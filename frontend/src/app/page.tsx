'use client';

import { useState, useEffect } from 'react';
import { initiateBlueskyAuth } from '@/lib/bluesky-auth';

export default function Home() {
  const [orcidData, setOrcidData] = useState<{ id: string; name: string } | null>(null);
  const [blueskyData, setBlueskyData] = useState<{ handle: string; did: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blueskyHandle, setBlueskyHandle] = useState<string>('');

  const handleOrcidAuth = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error('API URL not configured');
      
      const response = await fetch(`${apiUrl}/oauth/authorize?provider=orcid`);
      if (!response.ok) throw new Error('Failed to initiate ORCID authentication');
      
      if (response.status === 302) {
        const authUrl = response.headers.get('Location');
        if (!authUrl) throw new Error('No authorization URL in response');
        window.location.href = authUrl;
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start ORCID authentication');
    }
  };

  const handleBlueskyAuth = async () => {
    try {
      if (!blueskyHandle) {
        setError('Please enter your Bluesky handle');
        return;
      }
      const authUrl = await initiateBlueskyAuth(blueskyHandle);
      window.location.href = authUrl;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start Bluesky authentication');
    }
  };

  // Check for OAuth callback data
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const iss = searchParams.get('iss');

    if (code && state) {
      const handleCallback = async () => {
        try {
          const response = await fetch('/api/oauth/callback?' + searchParams.toString());
          if (!response.ok) throw new Error('Failed to handle OAuth callback');
          
          const data = await response.json();
          if (iss === 'https://orcid.org') {
            setOrcidData({ id: data.orcid_id, name: data.profile?.person?.name?.['given-names']?.value || 'Unknown' });
          } else if (iss === 'https://bsky.social') {
            setBlueskyData({ handle: data.handle, did: data.did });
          }
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Failed to complete authentication');
        }
      };

      handleCallback();
    }
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-center mb-8">Atproto Scientific Verifier</h1>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ORCID Column */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">ORCID</h2>
            {orcidData ? (
              <div className="space-y-2">
                <p className="text-gray-600">ID: {orcidData.id}</p>
                <p className="text-gray-600">Name: {orcidData.name}</p>
              </div>
            ) : (
              <button
                onClick={handleOrcidAuth}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Connect ORCID
              </button>
            )}
          </div>

          {/* Bluesky Column */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Bluesky</h2>
            {blueskyData ? (
              <div className="space-y-2">
                <p className="text-gray-600">Handle: {blueskyData.handle}</p>
                <p className="text-gray-600">DID: {blueskyData.did}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="bluesky-handle" className="block text-sm font-medium text-gray-700 mb-1">
                    Bluesky Handle
                  </label>
                  <input
                    type="text"
                    id="bluesky-handle"
                    value={blueskyHandle}
                    onChange={(e) => setBlueskyHandle(e.target.value)}
                    placeholder="e.g. hal.bsky.social"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleBlueskyAuth}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Connect Bluesky
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
