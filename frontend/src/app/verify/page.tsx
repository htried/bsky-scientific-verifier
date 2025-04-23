'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface VerificationStatus {
  status: 'pending' | 'verified' | 'failed';
  orcid_id?: string;
  bluesky_did?: string;
  error?: string;
}

export default function Verify() {
  const searchParams = useSearchParams();
  const verificationId = searchParams.get('verification_id');
  const [status, setStatus] = useState<VerificationStatus>({ status: 'pending' });
  const [blueskyDid, setBlueskyDid] = useState('');

  useEffect(() => {
    if (verificationId) {
      checkStatus();
    }
  }, [verificationId]);

  const checkStatus = async () => {
    try {
      const response = await fetch(`/api/status?verification_id=${verificationId}`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to check status:', error);
      setStatus({ status: 'failed', error: 'Failed to check verification status' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verification_id: verificationId,
          bluesky_did: blueskyDid,
        }),
      });
      const data = await response.json();
      if (data.status === 'pending') {
        setStatus({ status: 'pending' });
        // Poll for status updates
        const interval = setInterval(checkStatus, 2000);
        setTimeout(() => clearInterval(interval), 30000); // Stop after 30 seconds
      }
    } catch (error) {
      console.error('Failed to submit verification:', error);
      setStatus({ status: 'failed', error: 'Failed to submit verification' });
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">Complete Verification</h1>
        
        {status.status === 'pending' && (
          <div className="text-center">
            <p className="text-xl mb-4">Please enter your Bluesky DID to complete verification</p>
            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
              <input
                type="text"
                value={blueskyDid}
                onChange={(e) => setBlueskyDid(e.target.value)}
                placeholder="did:plc:..."
                className="w-full max-w-md p-2 border rounded"
                required
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Submit
              </button>
            </form>
          </div>
        )}

        {status.status === 'verified' && (
          <div className="text-center">
            <p className="text-xl mb-4 text-green-600">Verification Successful!</p>
            <p>Your ORCID ID: {status.orcid_id}</p>
            <p>Your Bluesky DID: {status.bluesky_did}</p>
          </div>
        )}

        {status.status === 'failed' && (
          <div className="text-center">
            <p className="text-xl mb-4 text-red-600">Verification Failed</p>
            <p>{status.error}</p>
          </div>
        )}
      </div>
    </main>
  );
} 