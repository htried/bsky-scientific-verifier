import json
import os
import logging
from unittest.mock import patch, MagicMock

import pytest
from chalice.test import Client

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Mock environment variables and boto3 before importing app
os.environ['VERIFICATION_TABLE'] = 'test-table'
os.environ['ORCID_CLIENT_ID'] = 'test-client-id'
os.environ['ORCID_CLIENT_SECRET'] = 'test-client-secret'
os.environ['FRONTEND_URL'] = 'https://test-frontend.com'
os.environ['API_BASE_URL'] = 'https://test-api.com'

# Mock boto3 resource and client
mock_table = MagicMock()
mock_dynamodb = MagicMock()
mock_dynamodb.Table.return_value = mock_table

with patch('boto3.resource', return_value=mock_dynamodb):
    from src.verifier.api.app import app

@pytest.fixture
def client():
    return Client(app)

@pytest.fixture
def table():
    return mock_table

@pytest.fixture
def mock_httpx():
    with patch('httpx.Client') as mock:
        mock_client = MagicMock()
        mock.return_value.__enter__.return_value = mock_client
        yield mock_client

def test_initiate_verification(client, table):
    # Set up mock response
    table.put_item.return_value = {}
    
    response = client.http.get('/initiate', headers={'Accept': '*/*'})
    if response.status_code == 400:
        print(f"DEBUG: Initiate response body: {response.body}")
    assert response.status_code == 302
    assert 'Location' in response.headers
    assert 'orcid.org/oauth/authorize' in response.headers['Location']
    assert 'test-api.com/callback' in response.headers['Location']
    
    # Verify DynamoDB call
    table.put_item.assert_called_once()
    assert 'STATE#' in table.put_item.call_args[1]['Item']['PK']

def test_orcid_callback(client, table, mock_httpx):
    # Set up mock responses
    table.get_item.return_value = {
        'Item': {
            'PK': 'STATE#test-state',
            'SK': 'STATE',
            'created_at': '2024-01-01T00:00:00'
        }
    }
    table.put_item.return_value = {}
    
    mock_httpx.post.return_value.status_code = 200
    mock_httpx.post.return_value.json.return_value = {
        'orcid': '0000-0000-0000-0000',
        'access_token': 'test-token'
    }
    
    mock_httpx.get.return_value.status_code = 200
    mock_httpx.get.return_value.json.return_value = {
        'person': {
            'name': {
                'given-names': {'value': 'Test'},
                'family-name': {'value': 'User'}
            }
        }
    }
    
    response = client.http.get('/callback?code=test-code&state=test-state', headers={'Accept': '*/*'})
    if response.status_code == 400:
        print(f"DEBUG: Callback response body: {response.body}")
    assert response.status_code == 302
    assert 'Location' in response.headers
    assert 'verify?verification_id=' in response.headers['Location']
    
    # Verify DynamoDB calls
    assert table.get_item.call_count == 1  # Get state
    assert table.put_item.call_count == 2  # Store state and create verification record
    assert any('VERIFICATION#' in call[1]['Item']['PK'] for call in table.put_item.call_args_list)

def test_verify_bluesky(client, table):
    # Set up mock response
    table.update_item.return_value = {}
    
    response = client.http.post(
        '/verify',
        headers={
            'Content-Type': 'application/json',
            'Accept': '*/*'
        },
        body=json.dumps({
            'verification_id': 'test-id',
            'bluesky_did': 'did:plc:test'
        })
    )
    if response.status_code == 400:
        print(f"DEBUG: Verify response body: {response.body}")
    assert response.status_code == 200
    assert json.loads(response.body)['status'] == 'pending'
    
    # Verify DynamoDB call
    table.update_item.assert_called_once()
    assert 'VERIFICATION#test-id' in table.update_item.call_args[1]['Key']['PK']

def test_check_status(client, table):
    # Set up mock response
    table.get_item.return_value = {
        'Item': {
            'PK': 'VERIFICATION#test-id',
            'SK': 'PROFILE',
            'orcid_id': '0000-0000-0000-0000',
            'verification_status': 'PENDING',
            'created_at': '2024-01-01T00:00:00',
            'updated_at': '2024-01-01T00:00:00'
        }
    }
    
    response = client.http.get('/status?verification_id=test-id', headers={'Accept': '*/*'})
    if response.status_code == 400:
        print(f"DEBUG: Status response body: {response.body}")
    assert response.status_code == 200
    data = json.loads(response.body)
    assert data['status'] == 'PENDING'
    assert data['orcid_id'] == '0000-0000-0000-0000'
    
    # Verify DynamoDB call
    assert table.get_item.call_count == 2  # Get state and get verification record
    assert any('VERIFICATION#test-id' in call[1]['Key']['PK'] for call in table.get_item.call_args_list) 