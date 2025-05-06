import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-light py-4 mt-5">
      <div className="container">
        <p className="text-center text-muted mb-0">
          <span role="img" aria-label="hand heart">🫶</span> built with pride by{' '}
          <a href="https://haltriedman.com" target="_blank" rel="noopener noreferrer">Hal Triedman</a>
          {' '}(<a href="https://bsky.app/profile/harold.bsky.social" target="_blank" rel="noopener noreferrer">Bluesky</a>,{' '}
          <a href="https://www.linkedin.com/in/hal-triedman/" target="_blank" rel="noopener noreferrer">LinkedIn</a>),{' '}
          <a href="https://www.linkedin.com/in/chaichanok-vilailuck" target="_blank" rel="noopener noreferrer">Man Vilailuck</a>, and{' '}
          <a href="https://www.linkedin.com/in/ceeceeo" target="_blank" rel="noopener noreferrer">CeeCee O'Connor</a>{' '}
          as a class project for the Spring 2025 edition of Cornell Tech's{' '}
          <a href="https://github.com/cornelltech/cs5342-spring2025/tree/main" target="_blank" rel="noopener noreferrer">Trust & Safety</a> class.{' '}
        </p>
        <p className="text-center text-muted mb-0">
          MIT Licensed | <a href="https://github.com/htried/bsky-scientific-verifier.git" target="_blank" rel="noopener noreferrer" style={{color: 'grey'}}>View source code on GitHub</a>
        </p>
      </div>
    </footer>
  );
} 