import axios from 'axios';
import open from 'open';

// Update with your API Gateway URL including stage name
const API_URL = process.env.API_URL || 'https://zpgkzlqawc.execute-api.us-east-1.amazonaws.com/prod';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bsky-scientific-verifier.vercel.app';

// Add API Gateway headers
const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Origin': FRONTEND_URL
};

async function testOAuth(provider, handle) {
    try {
        console.log(`Testing ${provider} OAuth flow...`);
        
        // Normalize provider name
        const normalizedProvider = provider === 'bluesky' ? 'atproto' : provider;
        
        // Start authorization flow
        const authUrl = `${API_URL}/oauth/authorize?provider=${normalizedProvider}${handle ? `&handle=${handle}` : ''}`;
        console.log('Requesting authorization URL:', authUrl);
        
        const authResponse = await axios.get(authUrl, {
            headers,
            maxRedirects: 0,
            validateStatus: (status) => status === 302
        });

        // Get the redirect URL
        const redirectUrl = authResponse.headers.location;
        console.log(`Opening browser for ${provider} authorization...`);
        console.log(`Redirect URL: ${redirectUrl}`);

        // Open the browser for user authorization
        await open(redirectUrl);

        console.log('\nAfter completing authorization in the browser:');
        console.log('1. Copy the callback URL from your browser');
        console.log('2. Extract the code and state parameters');
        console.log('3. Run the following command:');
        console.log(`   node test-oauth.js callback ${normalizedProvider} <code> <state>`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
    }
}

async function testCallback(provider, code, state) {
    try {
        console.log(`Testing ${provider} callback...`);
        
        // Normalize provider name
        const normalizedProvider = provider === 'bluesky' ? 'atproto' : provider;
        
        // Construct callback URL based on provider
        let callbackUrl;
        if (normalizedProvider === 'orcid') {
            callbackUrl = `${FRONTEND_URL}/api/orcid/callback?code=${code}&state=${state}&provider=${normalizedProvider}&iss=https://orcid.org`;
        } else {
            callbackUrl = `${FRONTEND_URL}/api/atproto/callback?code=${code}&state=${state}&provider=${normalizedProvider}&iss=https://bsky.social`;
        }
        
        console.log('Callback URL:', callbackUrl);
            
        const response = await axios.get(callbackUrl, {
            headers,
            maxRedirects: 0
        });

        console.log('Callback response:', response.data);
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
            console.error('Status:', error.response.status);
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === 'auth') {
    const provider = args[1];
    const handle = args[2];
    testOAuth(provider, handle);
} else if (command === 'callback') {
    const provider = args[1];
    const code = args[2];
    const state = args[3];
    testCallback(provider, code, state);
} else {
    console.log('Usage:');
    console.log('  node test-oauth.js auth <provider> [handle]');
    console.log('  node test-oauth.js callback <provider> <code> <state>');
} 