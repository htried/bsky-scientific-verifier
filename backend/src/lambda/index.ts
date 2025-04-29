import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
// import axios from 'axios';
import { NodeOAuthClient, Session, NodeSavedState, NodeSavedSession, OAuthSession } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const CLIENT_ID = process.env.CLIENT_ID || '';
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://bsky-scientific-verifier.vercel.app/api/orcid/callback';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://bsky-scientific-verifier.vercel.app';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'https://zpgkzlqawc.execute-api.us-east-1.amazonaws.com/prod';
const ATP_PROVIDER = process.env.ATP_PROVIDER || 'atproto';
const ORCID_PROVIDER = process.env.ORCID_PROVIDER || 'orcid';

// Initialize OAuth client
let oauthClient: NodeOAuthClient;

// Add this helper function at the top of the file
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

async function getJwksKeys(): Promise<string> {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: 'bsky-scientific-verifier-jwks-keys',
        VersionStage: 'AWSCURRENT',
      })
    );
    
    if (!response.SecretString) {
      throw new Error('No secret string found for JWKS keys');
    }
    
    return response.SecretString;
  } catch (error) {
    console.error('Error fetching JWKS keys:', error);
    throw error;
  }
}

async function initializeOAuthClient() {
  // Fetch JWKS keys from Secrets Manager
  const jwksKeys = await getJwksKeys();
  const keys = JSON.parse(jwksKeys);

  oauthClient = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${PUBLIC_URL}/oauth/client-metadata.json`,
      client_name: 'Bsky Scientific Verifier',
      client_uri: PUBLIC_URL,
      redirect_uris: [
        // `${PUBLIC_URL}/api/orcid/callback`,
        `${PUBLIC_URL}/api/atproto/callback`
      ],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'atproto openid', // Add openid scope
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      jwks_uri: `${PUBLIC_URL}/oauth/jwks.json`,
      dpop_bound_access_tokens: true,
    },
    keyset: await Promise.all([
      JoseKey.fromImportable(keys.ATP_PRIVATE_KEY_1, 'key1'),
      JoseKey.fromImportable(keys.ATP_PRIVATE_KEY_2, 'key2'),
      JoseKey.fromImportable(keys.ATP_PRIVATE_KEY_3, 'key3'),
    ]),
    stateStore: {
      async set(key: string, internalState: NodeSavedState) {
        const input: PutCommandInput = {
          TableName: process.env.OAUTH_STATE_TABLE,
          Item: {
            key,
            ...Object.fromEntries(
              Object.entries(internalState).filter(([_, value]) => value !== undefined)
            ),
            timestamp: Date.now()
          }
        };
        await docClient.send(new PutCommand(input));
      },
      async get(key: string) {
        const result = await docClient.send(new GetCommand({
          TableName: process.env.OAUTH_STATE_TABLE,
          Key: { key }
        }));
        return result.Item as NodeSavedState | undefined;
      },
      async del(key: string) {
        await docClient.send(new DeleteCommand({
          TableName: process.env.OAUTH_STATE_TABLE,
          Key: { key }
        }));
      }
    },
    sessionStore: {
      async set(key: string, value: NodeSavedSession) {
        const input: PutCommandInput = {
          TableName: process.env.OAUTH_SESSION_TABLE,
          Item: {
            key,
            ...Object.fromEntries(
              Object.entries(value).filter(([_, value]) => value !== undefined)
            ),
            timestamp: Date.now()
          }
        };
        await docClient.send(new PutCommand(input));
      },
      async get(key: string) {
        const result = await docClient.send(new GetCommand({
          TableName: process.env.OAUTH_SESSION_TABLE,
          Key: { key }
        }));
        return result.Item as NodeSavedSession | undefined;
      },
      async del(key: string) {
        await docClient.send(new DeleteCommand({
          TableName: process.env.OAUTH_SESSION_TABLE,
          Key: { key }
        }));
      }
    }
  });
}

// Extend OAuthSession type to include JWT properties
interface ExtendedOAuthSession extends Omit<OAuthSession, 'did'> {
  accessJwt?: string;
  refreshJwt?: string;
  handle?: string;
  did: `did:web:${string}` | `did:plc:${string}`;
}

interface OrcidTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  orcid: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Initialize OAuth client if not already initialized
    if (!oauthClient) {
      await initializeOAuthClient();
    }

    console.log('Received event:', JSON.stringify(event, null, 2));
    console.log('Environment variables:', {
      CLIENT_ID: CLIENT_ID ? '***' : 'not set',
      REDIRECT_URI,
      OAUTH_STATE_TABLE: process.env.OAUTH_STATE_TABLE,
      OAUTH_SESSION_TABLE: process.env.OAUTH_SESSION_TABLE,
      ORCID_CLIENT_ID: process.env.CLIENT_ID ? '***' : 'not set',
      ORCID_CLIENT_SECRET: process.env.CLIENT_SECRET ? '***' : 'not set',
      OAUTH_TOKEN_URL: process.env.OAUTH_TOKEN_URL || 'not set'
    });

    const { path, queryStringParameters } = event;
    console.log('Path:', path);
    console.log('Query parameters:', queryStringParameters);
    
    if (path === '/oauth/client-metadata.json') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        body: JSON.stringify({
          client_id: `${PUBLIC_URL}/oauth/client-metadata.json`,
          client_name: 'Bsky Scientific Verifier',
          client_uri: PUBLIC_URL,
          redirect_uris: [
            `${PUBLIC_URL}/api/orcid/callback`,
            `${PUBLIC_URL}/api/atproto/callback`
          ],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: 'atproto',
          application_type: 'web',
          token_endpoint_auth_method: 'private_key_jwt',
          token_endpoint_auth_signing_alg: 'ES256',
          jwks_uri: `${PUBLIC_URL}/oauth/jwks.json`,
          dpop_bound_access_tokens: true,
        }),
      };
    }
    
    if (path === '/oauth/authorize') {
      // Handle authorization request
      const state = generateRandomString(32);
      console.log('Generated state:', state);

      const provider = queryStringParameters?.provider || ORCID_PROVIDER;
      console.log('Using provider:', provider);
      
      if (provider === ORCID_PROVIDER) {
        // Construct ORCID authorization URL
        const authUrl = new URL(process.env.OAUTH_AUTH_URL || 'https://orcid.org/oauth/authorize');
        authUrl.searchParams.append('client_id', CLIENT_ID);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('scope', 'openid');
        authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('provider', 'orcid');
        
        return {
          statusCode: 302,
          headers: {
            Location: authUrl.toString(),
            ...corsHeaders
          },
          body: ''
        };
      } else if (provider === ATP_PROVIDER) {
        const handle = queryStringParameters?.handle;
        if (!handle) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            },
            body: JSON.stringify({ error: 'Handle is required for Bluesky authorization' })
          };
        }

        // Verify OAuth client is properly initialized
        if (!oauthClient) {
          await initializeOAuthClient();
        }

        if (!oauthClient.keyset) {
          throw new Error('OAuth client keyset not initialized');
        }

        console.log('Initializing Bluesky authorization for handle:', handle);
        const url = await oauthClient.authorize(handle, {
          state,
          scope: 'atproto',
          redirect_uri: `${PUBLIC_URL}/api/atproto/callback`
        });
        console.log('Authorize URL:', url);

        // Add provider parameter to the URL
        const authUrl = new URL(url);
        authUrl.searchParams.append('provider', 'atproto');
        
        return {
          statusCode: 302,
          headers: {
            Location: authUrl.toString(),
            ...corsHeaders
          },
          body: ''
        };
      } else {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          },
          body: JSON.stringify({ error: 'Invalid provider' })
        };
      }
    } else if (path === '/oauth/callback') {
      // Handle callback
      const { code, state, provider = ORCID_PROVIDER } = queryStringParameters || {};
      console.log('Callback parameters:', { code, state, provider });
      
      if (!code || !state) {
        console.error('Missing required parameters:', { code, state });
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required parameters' })
        };
      }

      if (provider === ORCID_PROVIDER) {
        // Exchange authorization code for access token
        const tokenUrl = process.env.OAUTH_TOKEN_URL || 'https://orcid.org/oauth/token';
        const orcidClientId = process.env.CLIENT_ID;
        const orcidClientSecret = process.env.CLIENT_SECRET;
        
        console.log('ORCID credentials:', {
          clientId: orcidClientId ? '***' : 'not set',
          clientSecret: orcidClientSecret ? '***' : 'not set',
          tokenUrl
        });
        
        if (!orcidClientId || !orcidClientSecret) {
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'ORCID client credentials not configured' })
          };
        }

        const authHeader = Buffer.from(`${orcidClientId}:${orcidClientSecret}`).toString('base64');
        
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authHeader}`
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${PUBLIC_URL}/api/orcid/callback`
          }).toString()
        });

        if (!tokenResponse.ok) {
          console.error('Token exchange failed:', await tokenResponse.text());
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Failed to exchange authorization code for token' })
          };
        }

        const tokenData = await tokenResponse.json() as OrcidTokenResponse;
        const accessToken = tokenData.access_token;
        const orcidId = tokenData.orcid;

        if (!accessToken || !orcidId) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No access token or ORCID ID in response' })
          };
        }

        // Get ORCID profile
        const profileUrl = `https://pub.orcid.org/v3.0/${orcidId}/record`;
        const profileResponse = await fetch(profileUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.orcid+json'
          }
        });

        if (!profileResponse.ok) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Failed to get ORCID profile' })
          };
        }

        const profileData = await profileResponse.json();

        return {
          statusCode: 200,
          body: JSON.stringify({ 
            success: true,
            orcid_id: orcidId,
            profile: profileData
          })
        };
      } else if (provider === ATP_PROVIDER) {
        try {
          // Create URLSearchParams directly from the query string
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(queryStringParameters || {})) {
            if (value) params.append(key, value);
          }

          console.log('Processing Bluesky callback with params:', {
            code: params.get('code') ? '***' : 'not present',
            iss: params.get('iss'),
            provider: params.get('provider'),
            state: params.get('state')
          });

          // Verify OAuth client is properly initialized
          if (!oauthClient) {
            throw new Error('OAuth client not initialized');
          }

          if (!oauthClient.keyset) {
            throw new Error('OAuth client keyset not initialized');
          }

          // Log the state before callback
          const state = params.get('state');
          if (state) {
            const storedState = await oauthClient.stateStore.get(state);
            console.log('Stored state for callback:', storedState);
          }

          // Remove the provider parameter as it's not part of the OAuth spec
          params.delete('provider');

          // Ensure we have all required parameters
          if (!params.get('code') || !params.get('iss') || !params.get('state')) {
            throw new Error('Missing required OAuth parameters');
          }

          // Make the token request with DPoP
          const result = await oauthClient.callback(params);
          const session = result.session as ExtendedOAuthSession;
          
          console.log('Token exchange successful:', {
            accessJwt: session.accessJwt ? '***' : 'not present',
            refreshJwt: session.refreshJwt ? '***' : 'not present',
            handle: session.handle,
            did: session.did
          });

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({ 
              success: true,
              handle: session.handle,
              did: session.did
            })
          };
        } catch (error: unknown) {
          const err = error as Error;
          console.error('Error exchanging token:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name,
            oauthClient: oauthClient ? {
              clientId: oauthClient.clientMetadata.client_id,
              redirectUris: oauthClient.clientMetadata.redirect_uris,
              keyset: oauthClient.keyset ? 'present' : 'missing'
            } : 'not initialized'
          });
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({ 
              error: 'Failed to exchange authorization code for token',
              details: err.message
            })
          };
        }
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid provider' })
        };
      }
    }

    console.error('Invalid path:', path);
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error: any) {
    console.error('Error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
} 