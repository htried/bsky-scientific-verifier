# Bluesky Scientific Verifier Frontend

This is the frontend application for the Bluesky Scientific Verifier. It provides a user interface for verifying scientific credentials using ORCID.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file in the root directory with the following variables:
```env
# API Configuration
API_BASE_URL=http://localhost:8000

# Frontend Configuration
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at http://localhost:3000.

## Features

- ORCID authentication flow
- Verification status tracking
- Bluesky DID submission
- Real-time status updates

## Development

- The application is built with Next.js 14 and TypeScript
- Uses Tailwind CSS for styling
- Implements the App Router pattern
- Follows modern React best practices with hooks and functional components

## API Routes

- `/api/initiate` - Starts the ORCID verification process
- `/api/verify` - Submits Bluesky DID for verification
- `/api/status` - Checks verification status

## Pages

- `/` - Home page with verification button
- `/verify` - Verification completion page
