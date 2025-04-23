import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

import boto3
import httpx
from chalice import Chalice, Response
from chalice.app import Request

app = Chalice(app_name='bluesky-verification')
app.api.binary_types.append('*/*')  # Enable async support

# Set up logging
logger = logging.getLogger(__name__)

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')
verification_table = dynamodb.Table(os.environ['VERIFICATION_TABLE'])

# Initialize SSM client
ssm = boto3.client('ssm')

# Constants
ORCID_AUTH_URL = "https://orcid.org/oauth/authorize"
ORCID_TOKEN_URL = "https://orcid.org/oauth/token"
ORCID_API_URL = "https://pub.orcid.org/v3.0"

def get_orcid_credentials():
    """Get ORCID credentials from SSM."""
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
        logger.error(f"Failed to get ORCID credentials: {e}")
        raise

def get_base_url() -> str:
    """Get the base URL for the API."""
    if app.current_request and hasattr(app.current_request, 'context'):
        try:
            return f"https://{app.current_request.context['domainName']}"
        except (KeyError, TypeError):
            pass
    return os.environ.get('API_BASE_URL', 'http://localhost:8000')

def get_request_params(request: Request) -> Dict:
    """Get request parameters safely."""
    try:
        return request.query_params or {}
    except:
        return {}

def get_request_body(request: Request) -> Dict:
    """Get request body safely."""
    try:
        return request.json_body or {}
    except:
        return {}

@app.route('/initiate', methods=['GET'], cors=True)
def initiate_verification() -> Response:
    """Initiate the ORCID OAuth flow."""
    logger.debug("Starting initiate_verification")
    logger.debug(f"Request: {app.current_request}")
    logger.debug(f"Query params: {get_request_params(app.current_request)}")
    
    state = str(uuid.uuid4())
    
    # Store state in DynamoDB with TTL
    verification_table.put_item(
        Item={
            'PK': f"STATE#{state}",
            'SK': 'STATE',
            'created_at': datetime.now().isoformat(),
            'ttl': int((datetime.now() + timedelta(minutes=5)).timestamp())
        }
    )
    
    # Get ORCID credentials
    client_id, _ = get_orcid_credentials()
    
    # Construct ORCID authorization URL
    redirect_uri = f"{get_base_url()}/v1/callback"
    auth_url = (
        f"{ORCID_AUTH_URL}?"
        f"client_id={client_id}&"
        f"response_type=token&"
        f"scope=openid&"
        f"redirect_uri={redirect_uri}&"
        f"state={state}"
    )
    
    return Response(
        status_code=302,
        headers={'Location': auth_url},
        body=''
    )

@app.route('/callback', methods=['GET'], cors=True)
def orcid_callback() -> Response:
    """Handle ORCID OAuth callback."""
    logger.debug("Starting orcid_callback")
    logger.debug(f"Request: {app.current_request}")
    logger.debug(f"Query params: {get_request_params(app.current_request)}")
    
    # Get access token from URL fragment
    fragment = app.current_request.query_params.get('fragment', '')
    params = dict(param.split('=') for param in fragment.split('&') if '=' in param)
    access_token = params.get('access_token')
    state = params.get('state')
    
    if not access_token or not state:
        logger.debug(f"Missing params - access_token: {access_token}, state: {state}")
        return Response(
            status_code=400,
            body={'error': 'Missing required parameters'}
        )
    
    # Verify state
    state_item = verification_table.get_item(
        Key={
            'PK': f"STATE#{state}",
            'SK': 'STATE'
        }
    ).get('Item')
    
    if not state_item:
        return Response(
            status_code=400,
            body={'error': 'Invalid state parameter'}
        )
    
    # Get ORCID profile
    with httpx.Client() as client:
        profile_response = client.get(
            f"{ORCID_API_URL}/record",
            headers={
                'Authorization': f"Bearer {access_token}",
                'Accept': 'application/json'
            }
        )
        
        if profile_response.status_code != 200:
            return Response(
                status_code=400,
                body={'error': 'Failed to fetch ORCID profile'}
            )
        
        profile_data = profile_response.json()
        orcid_id = profile_data.get('orcid-identifier', {}).get('path')
        
        if not orcid_id:
            return Response(
                status_code=400,
                body={'error': 'Failed to get ORCID ID'}
            )
        
        # Create verification record
        verification_id = str(uuid.uuid4())
        verification_table.put_item(
            Item={
                'PK': f"VERIFICATION#{verification_id}",
                'SK': 'PROFILE',
                'orcid_id': orcid_id,
                'verification_status': 'PENDING',
                'created_at': datetime.now().isoformat(),
                'ttl': int((datetime.now() + timedelta(days=7)).timestamp())
            }
        )
        
        # Redirect to frontend with verification ID
        frontend_url = os.environ.get('FRONTEND_URL', 'https://your-frontend.com')
        return Response(
            status_code=302,
            headers={'Location': f"{frontend_url}/verify?verification_id={verification_id}"},
            body=''
        )

@app.route('/verify', methods=['POST'], cors=True)
def verify_bluesky() -> Response:
    """Verify a Bluesky account."""
    logger.debug("Starting verify_bluesky")
    logger.debug(f"Request: {app.current_request}")
    logger.debug(f"Request body: {get_request_body(app.current_request)}")
    
    body = get_request_body(app.current_request)
    verification_id = body.get('verification_id')
    bluesky_did = body.get('bluesky_did')
    
    if not verification_id or not bluesky_did:
        logger.debug(f"Missing params - verification_id: {verification_id}, bluesky_did: {bluesky_did}")
        return Response(
            status_code=400,
            body={'error': 'Missing required parameters'}
        )
    
    # Update verification record with Bluesky DID
    verification_table.update_item(
        Key={
            'PK': f"VERIFICATION#{verification_id}",
            'SK': 'PROFILE'
        },
        UpdateExpression="SET bluesky_did = :did, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk, updated_at = :now",
        ExpressionAttributeValues={
            ':did': bluesky_did,
            ':gsi2pk': f"BLUESKY#{bluesky_did}",
            ':gsi2sk': 'PROFILE',
            ':now': datetime.now().isoformat()
        }
    )
    
    return Response(
        status_code=200,
        body={'status': 'pending', 'message': 'Verification initiated'}
    )

@app.route('/status', methods=['GET'], cors=True)
def check_status() -> Response:
    """Check verification status."""
    logger.debug("Starting check_status")
    logger.debug(f"Request: {app.current_request}")
    logger.debug(f"Query params: {get_request_params(app.current_request)}")
    
    params = get_request_params(app.current_request)
    verification_id = params.get('verification_id')
    
    if not verification_id:
        logger.debug(f"Missing verification_id: {verification_id}")
        return Response(
            status_code=400,
            body={'error': 'Missing verification_id'}
        )
    
    # Get verification record
    verification = verification_table.get_item(
        Key={
            'PK': f"VERIFICATION#{verification_id}",
            'SK': 'PROFILE'
        }
    ).get('Item')
    
    if not verification:
        return Response(
            status_code=404,
            body={'error': 'Verification not found'}
        )
    
    return Response(
        status_code=200,
        body={
            'status': verification['verification_status'],
            'orcid_id': verification['orcid_id'],
            'bluesky_did': verification.get('bluesky_did'),
            'created_at': verification['created_at'],
            'updated_at': verification['updated_at']
        }
    ) 