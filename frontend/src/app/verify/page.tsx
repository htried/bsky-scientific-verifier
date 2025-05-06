'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';

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
  const [isValidHandle, setIsValidHandle] = useState<boolean>(false);
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

  useEffect(() => {
    // Validate handle format
    setIsValidHandle(handle.endsWith('.bsky.social'));
  }, [handle]);

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
    window.location.href = `${apiUrl}/oauth/authorize?provider=atproto&handle=${handle}&orcidId=${verificationData.orcidId}&name=${encodeURIComponent(verificationData.name)}&institutions=${encodeURIComponent(JSON.stringify(verificationData.institutions))}&numPublications=${verificationData.numPublications}&publicationYears=${encodeURIComponent(JSON.stringify(verificationData.publicationYears || []))}&publicationTypes=${encodeURIComponent(JSON.stringify(verificationData.publicationTypes || []))}&publicationTitles=${encodeURIComponent(JSON.stringify(verificationData.publicationTitles || []))}&publicationJournals=${encodeURIComponent(JSON.stringify(verificationData.publicationJournals || []))}`;
  };

  if (error) {
    return (
      <div className="min-vh-100 bg-light py-5">
        <div className="container">
          <div className="card shadow-sm">
            <div className="card-body">
              <h2 className="text-danger mb-4">Error</h2>
              <p className="text-muted mb-4">{error}</p>
              <button
                onClick={() => router.push('/')}
                className="btn btn-primary"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!verificationData) {
    return (
      <div className="min-vh-100 bg-light py-5">
        <div className="container">
          <div className="card shadow-sm">
            <div className="card-body text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light py-5">
      <div className="container">
        <div className="card shadow-sm">
          <div className="card-body">
            <h2 className="text-center mb-4">Step 2: Connect Bluesky</h2>
            <p className="text-center text-muted mb-5">
              Your ORCID verification is complete! Now, let's connect your Bluesky account to link your verified academic identity.
              This will allow others to verify your scientific credentials on Bluesky.
            </p>
            
            <div className="row g-4">
              <div className="col-12">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h5 mb-3">Verified ORCID Profile</h3>
                    <div className="bg-light p-4 rounded">
                      <p className="mb-1">ID: <code className="text-primary">{verificationData.orcidId}</code></p>
                      <p className="mb-0">Name: <span className="text-primary">{verificationData.name}</span></p>
                    </div>
                  </div>
                </div>
              </div>

              {verificationData.institutions && verificationData.institutions.length > 0 && (
                <div className="col-12">
                  <div className="card h-100">
                    <div className="card-body">
                      <h3 className="h5 mb-3">Institutions</h3>
                      <div className="bg-light p-4 rounded">
                        <p className="text-muted mb-0">
                          {typeof verificationData.institutions === 'string' 
                            ? verificationData.institutions 
                            : verificationData.institutions.join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="col-12">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h5 mb-3">Publications</h3>
                    <div className="bg-light p-4 rounded">
                      <p className="text-muted mb-3">{verificationData.numPublications} publications found</p>
                      
                      {verificationData.publicationYears && verificationData.publicationYears.length > 0 && (
                        <div className="mt-3">
                          <h5 className="h6 mb-2">Publication Years</h5>
                          <p className="text-muted">
                            - Earliest published work: {Math.min(...verificationData.publicationYears)}
                            <br />
                            - Latest published work: {Math.max(...verificationData.publicationYears)}
                          </p>
                        </div>
                      )}

                      {verificationData.publicationTypes && verificationData.publicationTypes.length > 0 && (
                        <div className="mt-3">
                          <h5 className="h6 mb-2">Publication Types</h5>
                          <p className="text-muted">
                            {verificationData.publicationTypes.join(', ')}
                          </p>
                        </div>
                      )}

                      {verificationData.publicationTitles && verificationData.publicationTitles.length > 0 && (
                        <div className="mt-3">
                          <h5 className="h6 mb-2">Recent Publications</h5>
                          <ul className="list-unstyled text-muted">
                            {verificationData.publicationTitles.slice(0, 5).map((title, index) => (
                              <li key={index} className="mb-2">
                               - {title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {verificationData.publicationJournals && verificationData.publicationJournals.length > 0 && (
                        <div className="mt-3">
                          <h5 className="h6 mb-2">Recent Publication Venues</h5>
                          <ul className="list-unstyled text-muted">
                            {verificationData.publicationJournals.slice(0, 5).map((journal, index) => (
                              <li key={index} className="mb-2">
                               - {journal}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h5 mb-3">Status</h3>
                    <div className="bg-light p-4 rounded">
                      <p className="text-muted mb-0">{verificationData.status}</p>
                    </div>
                  </div>
                </div>
              </div>

              {verificationData.status === 'pending_bluesky' && (
                <div className="col-12">
                  <div className="card h-100">
                    <div className="card-body">
                      <label htmlFor="bluesky-handle" className="form-label">
                        Enter your Bluesky handle
                      </label>
                      <p className="text-muted small mb-3">
                        This is the account that will be linked to your verified academic identity.
                      </p>
                      <input
                        type="text"
                        id="bluesky-handle"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="e.g. your-handle.bsky.social"
                        className="form-control mb-3"
                      />
                      <button
                        onClick={handleBlueskyAuth}
                        className="btn btn-primary w-100"
                        disabled={!isValidHandle}
                      >
                        {isValidHandle ? 'Connect Bluesky Account' : 'Handle must be valid and end with .bsky.social'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Return to Home Button */}
              <div className="col-12">
                <div className="d-grid">
                  <button
                    onClick={() => router.push('/')}
                    className="btn btn-outline-secondary"
                  >
                    Return to Home
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
} 