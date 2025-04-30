'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addBlueskyLabels, removeBlueskyLabels } from '@/lib/bluesky-auth';

interface VerificationData {
  orcidId: string;
  name: string;
  institutions: string[];
  numPublications: number;
  status: string;
  blueskyHandle?: string;
  blueskyDid?: string;
}

export default function VerifiedPage() {
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    
    const orcidId = searchParams.get('orcidId');
    const name = searchParams.get('name');
    const institutionsParam = searchParams.get('institutions');
    const numPublications = searchParams.get('numPublications');
    const status = searchParams.get('status');
    const blueskyHandle = searchParams.get('handle');
    const blueskyDid = searchParams.get('did');

    if (!orcidId || !name || !numPublications || !status || !blueskyHandle || !blueskyDid) {
      setError('Missing required verification data');
      return;
    }

    const institutions = institutionsParam ? JSON.parse(institutionsParam) : [];

    setVerificationData({
      orcidId,
      name,
      institutions,
      numPublications: parseInt(numPublications),
      status: 'verified',
      blueskyHandle,
      blueskyDid
    });
  }, []);

  const handleAddLabels = async () => {
    if (!verificationData) return;

    try {
      await addBlueskyLabels(
        verificationData.blueskyHandle!,
        verificationData.blueskyDid!,
        {
          orcidId: verificationData.orcidId,
          numPublications: verificationData.numPublications,
          // We'll need to add firstPubYear, lastPubYear, and lastInstitution later
          // These can be extracted from the ORCID data
        }
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to add labels');
    }
  };

  const handleRemoveLabels = async () => {
    if (!verificationData) return;

    try {
      await removeBlueskyLabels(
        verificationData.blueskyHandle!,
        verificationData.blueskyDid!,
        verificationData.orcidId
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to remove labels');
    }
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
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Verification Complete! 🎉</h2>
          <p className="text-gray-300 mb-8 text-center leading-relaxed">
            Congratulations! Your Bluesky account has been successfully linked to your verified academic identity.
            Click the button below to add verification labels to your Bluesky profile.
          </p>
          
          <div className="space-y-6">
            {/* ORCID Section */}
            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Verified Academic Profile</h3>
              <div className="space-y-2">
                <p className="text-gray-300">ORCID ID: <span className="text-blue-400 font-mono">{verificationData.orcidId}</span></p>
                <p className="text-gray-300">Name: <span className="text-blue-400">{verificationData.name}</span></p>
              </div>

              {verificationData.institutions && verificationData.institutions.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-gray-200 mb-3">Institutions</h4>
                  <p className="text-gray-300">
                    {typeof verificationData.institutions === 'string' 
                      ? verificationData.institutions 
                      : verificationData.institutions.join(', ')}
                  </p>
                </div>
              )}

              <div className="mt-4">
                <h4 className="font-medium text-gray-200 mb-3">Publications</h4>
                <p className="text-gray-300">{verificationData.numPublications} publications found</p>
              </div>
            </div>

            {/* Bluesky Section */}
            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Connected Bluesky Account</h3>
              <div className="space-y-2">
                <p className="text-gray-300">Handle: <span className="text-blue-400 font-mono">{verificationData.blueskyHandle}</span></p>
                <p className="text-gray-300">DID: <span className="text-blue-400 font-mono">{verificationData.blueskyDid}</span></p>
              </div>
            </div>

            {/* Status Section */}
            <div className="card-section">
              <h3 className="font-medium text-gray-200 mb-3">Status</h3>
              <div className="flex items-center">
                <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
                <p className="text-gray-300">Verified</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-6">
              <div>
                <button
                  onClick={handleAddLabels}
                  className="btn-primary"
                >
                  Add Labels to Bluesky
                </button>
                <p className="text-gray-400 text-sm text-center mt-2">
                  This will add verification labels to your Bluesky profile, making your academic credentials visible to others.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleAddLabels}
                  className="btn-secondary"
                >
                  Refresh Labels
                </button>
                <button
                  onClick={handleRemoveLabels}
                  className="btn-danger"
                >
                  Remove Labels
                </button>
              </div>
              <p className="text-gray-400 text-sm text-center">
                Use these buttons to update or remove your verification labels at any time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 