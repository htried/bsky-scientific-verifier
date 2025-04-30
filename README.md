# Bluesky Scientific Verifier

A serverless application that verifies scientists on Bluesky using ORCID authentication and issues verification labels.

## Architecture

The application uses AWS serverless services:
- AWS Lambda for API endpoints
- API Gateway for HTTP routing
- DynamoDB for data storage
- Parameter Store for secret management

## Prerequisites

- Python 3.11+
- AWS CDK
- AWS CLI configured with appropriate credentials
- ORCID API credentials
- Bluesky API credentials

## Setup

1. Create a virtual environment and install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. Configure AWS credentials:
```bash
aws configure
```

3. Store ORCID credentials in AWS Parameter Store:
```bash
aws ssm put-parameter --name "/verifier/orcid/client-id" --value "your-client-id" --type SecureString
aws ssm put-parameter --name "/verifier/orcid/client-secret" --value "your-client-secret" --type SecureString
```

4. Deploy the infrastructure:
```bash
cd src/verifier/infrastructure
cdk deploy
```

## API Endpoints

- `GET /initiate` - Start the ORCID verification process
- `GET /callback` - ORCID OAuth callback
- `POST /verify` - Submit Bluesky account for verification
- `GET /status` - Check verification status

## Development

1. Install development dependencies:
```bash
pip install -r requirements-dev.txt
```

2. Run tests:
```bash
pytest
```

3. Format code:
```bash
black .
isort .
```

## License

MIT License - see LICENSE file for details 