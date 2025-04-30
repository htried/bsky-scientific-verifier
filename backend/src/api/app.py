import os
import uuid
import logging
from datetime import datetime, timedelta
import httpx
import boto3
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Set up logging
logger = logging.getLogger(__name__)

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb', 
    endpoint_url=os.environ.get('DYNAMODB_ENDPOINT', 'http://localhost:8000'),
    region_name=os.environ.get('AWS_REGION', 'us-east-1'),
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID', 'dummy'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY', 'dummy')
)
verification_table = dynamodb.Table(os.environ.get('VERIFICATION_TABLE', 'verifications'))

# Initialize SSM client
ssm = boto3.client('ssm',
    endpoint_url=os.environ.get('SSM_ENDPOINT', 'http://localhost:8000'),
    region_name=os.environ.get('AWS_REGION', 'us-east-1'),
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID', 'dummy'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY', 'dummy')
)

# Constants
ORCID_AUTH_URL = "https://orcid.org/oauth/authorize"
ORCID_TOKEN_URL = "https://orcid.org/oauth/token"
ORCID_API_URL = "https://pub.orcid.org/v3.0"
BASE_URL = os.environ.get('BASE_URL', 'http://localhost:3000')

app = FastAPI(title="Bluesky Scientific Verifier API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_orcid_credentials():
    """Get ORCID credentials from environment or SSM."""
    if os.environ.get('ORCID_CLIENT_ID') and os.environ.get('ORCID_CLIENT_SECRET'):
        return os.environ['ORCID_CLIENT_ID'], os.environ['ORCID_CLIENT_SECRET']
    
    try:
        client_id = ssm.get_parameter(
            Name='/verifier/orcid/client-id',
            WithDecryption=True
        )['Parameter']['Value']
        client_secret = ssm.get_parameter(
            Name='/verifier/orcid/client-secret',
            WithDecryption=True
        )['Parameter']['Value']
        return client_id, client_secret
    except Exception as e:
        logger.error(f"Failed to get ORCID credentials from SSM: {e}")
        raise HTTPException(status_code=500, detail="ORCID credentials not configured")

class VerificationRequest(BaseModel):
    verification_id: str
    bluesky_did: Optional[str] = None

class VerificationResponse(BaseModel):
    verification_id: str
    orcid_id: Optional[str] = None
    bluesky_did: Optional[str] = None
    status: str
    created_at: str

@app.get("/")
async def root():
    return {"message": "Bluesky Scientific Verifier API"}

@app.get("/initiate")
async def initiate_verification():
    """Initiate the ORCID OAuth flow."""
    logger.info("Starting initiate_verification")
    
    state = str(uuid.uuid4())
    verification_id = str(uuid.uuid4())
    
    # Get ORCID credentials
    client_id, _ = get_orcid_credentials()
    
    # Construct ORCID authorization URL
    frontend_url = os.environ.get('FRONTEND_URL', BASE_URL)
    redirect_uri = f"{frontend_url}/api/verify"
    auth_url = (
        f"{ORCID_AUTH_URL}?"
        f"client_id={client_id}&"
        f"response_type=code&"
        f"scope=openid&"
        f"redirect_uri={redirect_uri}&"
        f"state={state}"
    )
    
    # Store initial verification record
    verification_table.put_item(
        Item={
            'PK': f"VERIFICATION#{verification_id}",
            'SK': 'PROFILE',
            'verification_id': verification_id,
            'state': state,
            'verification_status': 'INITIATED',
            'created_at': datetime.now().isoformat(),
            'ttl': int((datetime.now() + timedelta(days=7)).timestamp())
        }
    )
    
    return {
        'authUrl': auth_url,
        'verification_id': verification_id,
        'state': state
    }

@app.get("/callback")
async def orcid_callback(code: str, state: str):
    """Handle ORCID OAuth callback."""
    logger.info("Starting ORCID callback handler")
    
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing required parameters")
    
    # Find verification record by state
    response = verification_table.scan(
        FilterExpression='#state = :state',
        ExpressionAttributeNames={'#state': 'state'},
        ExpressionAttributeValues={':state': state}
    )
    
    if not response.get('Items'):
        raise HTTPException(status_code=400, detail="Invalid state")
    
    verification = response['Items'][0]
    verification_id = verification['verification_id']
    
    # Exchange authorization code for access token
    client_id, client_secret = get_orcid_credentials()
    frontend_url = os.environ.get('FRONTEND_URL', BASE_URL)
    redirect_uri = f"{frontend_url}/api/verify"
    
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            ORCID_TOKEN_URL,
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
                'client_id': client_id,
                'client_secret': client_secret
            },
            headers={'Accept': 'application/json'}
        )
        
        if token_response.status_code != 200:
            logger.error(f"Failed to get access token. Status: {token_response.status_code}")
            raise HTTPException(status_code=400, detail="Failed to get access token")
        
        token_data = token_response.json()
        access_token = token_data.get('access_token')
        orcid_id = token_data.get('orcid')
        
        if not access_token or not orcid_id:
            raise HTTPException(status_code=400, detail="No access token or ORCID ID in response")
        
        # Get ORCID profile
        profile_response = await client.get(
            f"{ORCID_API_URL}/{orcid_id}/record",
            headers={
                'Authorization': f"Bearer {access_token}",
                'Accept': 'application/vnd.orcid+json'
            }
        )
        
        if profile_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get ORCID profile")
        
        profile_data = profile_response.json()
        
        # Update verification record with ORCID info
        verification_table.update_item(
            Key={
                'PK': f"VERIFICATION#{verification_id}",
                'SK': 'PROFILE'
            },
            UpdateExpression="SET orcid_id = :orcid, verification_status = :status",
            ExpressionAttributeValues={
                ':orcid': orcid_id,
                ':status': 'ORCID_VERIFIED'
            }
        )
        
        return {
            'verification_id': verification_id,
            'orcid_id': orcid_id,
            'status': 'ORCID_VERIFIED'
        }

@app.get("/status")
async def check_status(verification_id: str = Query(..., description="The verification ID to check")):
    """Check verification status."""
    if not verification_id:
        raise HTTPException(status_code=400, detail="Missing verification_id")
    
    verification = verification_table.get_item(
        Key={
            'PK': f"VERIFICATION#{verification_id}",
            'SK': 'PROFILE'
        }
    ).get('Item')
    
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    
    return VerificationResponse(
        verification_id=verification['verification_id'],
        orcid_id=verification.get('orcid_id'),
        bluesky_did=verification.get('bluesky_did'),
        status=verification['verification_status'],
        created_at=verification['created_at']
    )

@app.post("/verify")
async def verify_bluesky(request: VerificationRequest):
    """Update verification with Bluesky DID."""
    logger.info("Starting verify_bluesky")
    
    verification = verification_table.get_item(
        Key={
            'PK': f"VERIFICATION#{request.verification_id}",
            'SK': 'PROFILE'
        }
    ).get('Item')
    
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    
    if not verification.get('orcid_id'):
        raise HTTPException(status_code=400, detail="ORCID authentication required")
    
    # Update verification record with Bluesky DID
    verification_table.update_item(
        Key={
            'PK': f"VERIFICATION#{request.verification_id}",
            'SK': 'PROFILE'
        },
        UpdateExpression="SET bluesky_did = :did, verification_status = :status",
        ExpressionAttributeValues={
            ':did': request.bluesky_did,
            ':status': 'VERIFIED'
        }
    )
    
    return VerificationResponse(
        verification_id=verification['verification_id'],
        orcid_id=verification['orcid_id'],
        bluesky_did=request.bluesky_did,
        status='VERIFIED',
        created_at=verification['created_at']
    ) 