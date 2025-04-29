# Backend Service

This is the backend service for the Bluesky Scientific Verifier. It includes:
- FastAPI application for the main API
- AWS Lambda functions for OAuth
- CDK infrastructure code

## Setup

1. Install Node.js dependencies:
```bash
npm install
```

2. Install Python dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Running

### Development

Start the API server and Lambda function in development mode:
```bash
npm run dev
```

### Production

Build and run the API server:
```bash
npm run build
npm run start:api
```

### Infrastructure

Deploy the infrastructure:
```bash
npm run deploy:infra
```

## Project Structure

- `src/api/` - FastAPI application
- `src/lambda/` - AWS Lambda functions
- `src/infrastructure/` - CDK infrastructure code 