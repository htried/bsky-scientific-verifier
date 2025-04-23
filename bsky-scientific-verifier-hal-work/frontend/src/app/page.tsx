'use client';

export default function Home() {
  const handleVerify = async () => {
    try {
      const response = await fetch('/api/initiate');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate verification:', error);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">Bluesky Scientific Verifier</h1>
        <p className="text-xl mb-8 text-center">
          Verify your scientific credentials on Bluesky using your ORCID account
        </p>
        <div className="flex justify-center">
          <button
            onClick={handleVerify}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
          >
            Verify with ORCID
          </button>
        </div>
      </div>
    </main>
  );
}
