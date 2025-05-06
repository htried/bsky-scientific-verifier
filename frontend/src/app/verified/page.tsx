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
  blueskyHandle?: string;
  blueskyDid?: string;
  publicationYears?: number[];
  publicationTypes?: string[];
  publicationTitles?: string[];
  publicationJournals?: string[];
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
    const publicationYearsParam = searchParams.get('publicationYears');
    const publicationTypesParam = searchParams.get('publicationTypes');
    const publicationTitlesParam = searchParams.get('publicationTitles');
    const publicationJournalsParam = searchParams.get('publicationJournals');

    // Log raw received data
    console.log('Raw URL Parameters:', {
      orcidId,
      name,
      institutionsParam,
      numPublications,
      status,
      blueskyHandle,
      blueskyDid,
      publicationYearsParam,
      publicationTypesParam,
      publicationTitlesParam,
      publicationJournalsParam
    });

    if (!orcidId || !name || !numPublications || !status || !blueskyHandle || !blueskyDid) {
      setError('Missing required verification data');
      return;
    }

    const institutions = institutionsParam ? JSON.parse(JSON.parse(institutionsParam)) : [];
    
    // Parse publication years - handle double-encoded JSON
    let publicationYears: number[] = [];
    if (publicationYearsParam) {
      try {
        publicationYears = JSON.parse(JSON.parse(publicationYearsParam));
        console.log('Parsed Publication Years:', publicationYears);
      } catch (e) {
        console.error('Failed to parse publication years:', e);
      }
    }

    // Parse publication types - handle double-encoded JSON
    let publicationTypes: string[] = [];
    if (publicationTypesParam) {
      try {
        publicationTypes = JSON.parse(JSON.parse(publicationTypesParam))
          .map((type: string) => type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
        console.log('Parsed Publication Types:', publicationTypes);
      } catch (e) {
        console.error('Failed to parse publication types:', e);
      }
    }

    // Parse publication titles - handle double-encoded JSON
    let publicationTitles: string[] = [];
    if (publicationTitlesParam) {
      try {
        publicationTitles = JSON.parse(JSON.parse(publicationTitlesParam))
          .map((title: string) => title.trim());
        console.log('Parsed Publication Titles:', publicationTitles);
      } catch (e) {
        console.error('Failed to parse publication titles:', e);
      }
    }

    // Parse publication journals - handle double-encoded JSON
    let publicationJournals: string[] = [];
    if (publicationJournalsParam) {
      try {
        publicationJournals = JSON.parse(JSON.parse(publicationJournalsParam))
          .map((journal: string) => journal.trim());
        console.log('Parsed Publication Journals:', publicationJournals);
      } catch (e) {
        console.error('Failed to parse publication journals:', e);
      }
    }

    const finalData = {
      orcidId,
      name,
      institutions,
      numPublications: parseInt(numPublications),
      status: 'verified',
      blueskyHandle,
      blueskyDid,
      publicationYears,
      publicationTypes,
      publicationTitles,
      publicationJournals
    };

    console.log('Final Parsed Data:', finalData);
    setVerificationData(finalData);
  }, []);

  const handleAddLabels = async () => {
    if (!verificationData) return;
    
    try {
      const response = await fetch('/api/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: verificationData.blueskyHandle,
          did: verificationData.blueskyDid,
          action: 'add',
          labels: {
            orcidId: verificationData.orcidId,
            numPublications: verificationData.numPublications,
            firstPubYear: verificationData.publicationYears ? 
              Math.min(...verificationData.publicationYears) : undefined,
            lastPubYear: verificationData.publicationYears ? 
              Math.max(...verificationData.publicationYears) : undefined,
            institutions: verificationData.institutions
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add labels');
      }

      // Show success message
      alert('Labels added successfully!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to add labels');
    }
  };

  const handleRemoveLabels = async () => {
    if (!verificationData) return;
    // alert(alert_message);
    
    try {
      const response = await fetch('/api/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: verificationData.blueskyHandle,
          did: verificationData.blueskyDid,
          action: 'delete',
          labels: {
            orcidId: verificationData.orcidId,
            numPublications: verificationData.numPublications,
            firstPubYear: verificationData.publicationYears ? 
              Math.min(...verificationData.publicationYears) : undefined,
            lastPubYear: verificationData.publicationYears ? 
              Math.max(...verificationData.publicationYears) : undefined,
            institutions: verificationData.institutions
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to remove labels');
      }

      // Show success message
      alert('Labels removed successfully!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to remove labels');
    }
  };

  const handleUpdateLabels = async () => {
    if (!verificationData) return;
    // alert(alert_message);
    
    try {
      const response = await fetch('/api/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: verificationData.blueskyHandle,
          did: verificationData.blueskyDid,
          action: 'update',
          labels: {
            orcidId: verificationData.orcidId,
            numPublications: verificationData.numPublications,
            firstPubYear: verificationData.publicationYears ? 
              Math.min(...verificationData.publicationYears) : undefined,
            lastPubYear: verificationData.publicationYears ? 
              Math.max(...verificationData.publicationYears) : undefined,
            institutions: verificationData.institutions
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update labels');
      }

      // Show success message
      alert('Labels updated successfully!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update labels');
    }
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
            <h2 className="text-center mb-4">Verification Complete! 🎉</h2>
            <p className="text-center text-muted mb-5">
              Congratulations! Your Bluesky account has been successfully linked to your verified academic identity.
              Click the button below to add, delete, or refresh scientific verification labels on your Bluesky profile.
            </p>
            
            <div className="row g-4">
              {/* ORCID Section */}
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
                            - Earliest published work: {Math.min(...verificationData.publicationYears.filter(year => !isNaN(year)))}
                            <br />
                            - Latest published work: {Math.max(...verificationData.publicationYears.filter(year => !isNaN(year)))}
                          </p>
                        </div>
                      )}

                      {verificationData.publicationTypes && verificationData.publicationTypes.length > 0 && (
                        <div className="mt-3">
                          <h5 className="h6 mb-2">Publication Types</h5>
                          <p className="text-muted">
                            {Array.isArray(verificationData.publicationTypes) 
                              ? verificationData.publicationTypes.join(', ')
                              : String(verificationData.publicationTypes).replace(/[\[\]"]/g, '').split(',').map(type => type.trim().replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(', ')}
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

              {/* Bluesky Section */}
              <div className="col-12">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h5 mb-3">Connected Bluesky Account</h3>
                    <div className="bg-light p-4 rounded">
                      <p className="mb-1">Handle: <code className="text-primary">{verificationData.blueskyHandle}</code></p>
                      <p className="mb-0">DID: <code className="text-primary">{verificationData.blueskyDid}</code></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Labels Preview Section */}
              <div className="col-12">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h5 mb-3">Labels To Be Added To Your Bluesky Profile</h3>
                    <div className="bg-light p-4 rounded">
                      <div className="d-flex flex-wrap gap-2">
                        {/* Verified Scientist Label */}
                        <span className="badge bg-primary">
                          Verified Scientist 🔬
                        </span>

                        {/* Publication Count Label */}
                        {verificationData.numPublications > 0 && (
                          <span className="badge bg-info">
                            {(() => {
                              const count = verificationData.numPublications;
                              if (count >= 250) return "250+ Publications 📚";
                              if (count >= 100) return "100-249 Publications 📚";
                              if (count >= 50) return "50-99 Publications 📚";
                              if (count >= 10) return "10-49 Publications 📚";
                              return "1-9 Publications 📚";
                            })()}
                          </span>
                        )}

                        {/* Publication Years Label */}
                        {verificationData.publicationYears && verificationData.publicationYears.length > 0 && (
                          <span className="badge bg-success">
                            {(() => {
                              const years = verificationData.publicationYears;
                              const range = Math.max(...years) - Math.min(...years);
                              if (range >= 20) return "20+ Years Publishing 📅";
                              if (range >= 10) return "10-19 Years Publishing 📅";
                              if (range >= 5) return "5-9 Years Publishing 📅";
                              return "0-4 Years Publishing 📅";
                            })()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="col-12">
                <div className="d-grid gap-4">
                  <div>
                    <button
                      onClick={handleAddLabels}
                      className="btn btn-primary w-100"
                    >
                      Add Labels to Bluesky
                    </button>
                    <p className="text-muted text-center mt-2 small">
                      This will add verification labels to your Bluesky profile, making your academic credentials visible to others.
                    </p>
                  </div>

                  <div className="d-flex gap-3">
                    <button
                      onClick={handleUpdateLabels}
                      className="btn btn-outline-primary flex-grow-1"
                    >
                      Refresh Labels
                    </button>
                    <button
                      onClick={handleRemoveLabels}
                      className="btn btn-outline-danger flex-grow-1"
                    >
                      Remove Labels
                    </button>
                  </div>
                  <p className="text-muted text-center small">
                    Use these buttons to update or remove your verification labels at any time.
                  </p>
                </div>
              </div>

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