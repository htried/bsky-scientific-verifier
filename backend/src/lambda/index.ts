import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, PutCommandInput, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { NodeOAuthClient, NodeSavedState, NodeSavedSession, OAuthSession } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import {
  getOrcidProfile,
  extractNameFromProfile,
  extractVerifiedInstitution,
  fetchOrcidWorks,
  searchPubmedByOrcid,
  fetchPubmedMetadata,
  storeVerificationData
} from './orcid-utils';
import { addLabels, removeLabels } from './labels';

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
const getCorsHeaders = (origin: string | undefined) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

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

interface ExtendedOAuthSession extends OAuthSession {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  service: string;
}

interface OrcidTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  orcid: string;
}

async function storeOrcidForHandle(handle: string, orcidId: string): Promise<void> {
  const input: PutCommandInput = {
    TableName: process.env.VERIFICATION_TABLE,
    Item: {
      handle,
      orcidId,
      timestamp: new Date().toISOString()
    }
  };
  await docClient.send(new PutCommand(input));
}

async function getOrcidForHandle(handle: string): Promise<string | undefined> {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.VERIFICATION_TABLE,
    IndexName: 'BlueskyHandleIndex',
    KeyConditionExpression: 'blueskyHandle = :handle',
    ExpressionAttributeValues: {
      ':handle': handle
    }
  }));
  return result.Items?.[0]?.orcidId;
}

interface OrcidName {
  'given-names': { value: string };
  'family-name': { value: string };
}

interface OrcidProfile {
  name: OrcidName;
}

interface OrcidEmployment {
  employment: Array<{
    organization: {
      name: { value: string };
    };
  }>;
}

interface OrcidWorks {
  group: Array<any>;
}

interface VerificationData {
  handle: string;
  did: string;
  orcidId: string;
  status: 'pending' | 'verified' | 'failed';
  verifiedAt?: string;
  error?: string;
  accessJwt?: string;
  refreshJwt?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers: getCorsHeaders(event.headers.origin),
      body: ''
    };
  }

  try {
    // Initialize OAuth client if not already initialized
    if (!oauthClient) {
      console.log('Initializing OAuth client');
      await initializeOAuthClient();
      if (!oauthClient) {
        return {
          statusCode: 500,
          headers: getCorsHeaders(event.headers.origin),
          body: JSON.stringify({ error: 'Failed to initialize OAuth client' })
        };
      }
    }

    console.log('Received event:', {
      path: event.path,
      httpMethod: event.httpMethod,
      queryStringParameters: event.queryStringParameters,
      headers: event.headers,
      body: event.body
    });

    console.log('Environment variables:', {
      CLIENT_ID: CLIENT_ID ? '***' : 'not set',
      REDIRECT_URI,
      OAUTH_STATE_TABLE: process.env.OAUTH_STATE_TABLE,
      OAUTH_SESSION_TABLE: process.env.OAUTH_SESSION_TABLE,
      ORCID_CLIENT_ID: process.env.CLIENT_ID ? '***' : 'not set',
      ORCID_CLIENT_SECRET: process.env.CLIENT_SECRET ? '***' : 'not set',
      OAUTH_TOKEN_URL: process.env.OAUTH_TOKEN_URL || 'not set',
      PUBLIC_URL: PUBLIC_URL,
      API_GATEWAY_URL: API_GATEWAY_URL
    });

    const { path, queryStringParameters } = event;
    console.log('Path:', path);
    console.log('Query parameters:', queryStringParameters);
    
    if (path === '/oauth/client-metadata.json') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(event.headers.origin)
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
      let state = generateRandomString(32);
      console.log('Generated state:', state);

      const provider = queryStringParameters?.provider || ORCID_PROVIDER;
      console.log('Using provider:', provider);
      
      if (provider === ORCID_PROVIDER) {
        // Construct ORCID authorization URL
        const authUrl = new URL(process.env.OAUTH_AUTH_URL || 'https://orcid.org/oauth/authorize');
        authUrl.searchParams.append('client_id', CLIENT_ID);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('scope', 'openid');
        authUrl.searchParams.append('redirect_uri', `${PUBLIC_URL}/api/orcid/callback`);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('provider', 'orcid');
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(event.headers.origin)
          },
          body: JSON.stringify({
            authUrl: authUrl.toString()
          })
        };
      } else if (provider === ATP_PROVIDER) {
        const handle = queryStringParameters?.handle;
        if (!handle) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Handle is required for Bluesky authorization' })
          };
        }

        // Store ORCID ID for the handle and modify state before authorization
        if (queryStringParameters?.orcidId && queryStringParameters?.handle) {
          // Normalize the handle to ensure it's in the correct format
          const normalizedHandle = queryStringParameters.handle.replace(/,/g, '.');
          
          console.log('Storing ORCID ID for handle:', {
            handle: normalizedHandle,
            orcidId: queryStringParameters.orcidId
          });
          await storeOrcidForHandle(normalizedHandle, queryStringParameters.orcidId);
          // Append ORCID ID, handle, and ORCID data to state parameter
          const orcidData = {
            name: queryStringParameters.name || '',
            institutions: queryStringParameters.institutions || [],
            numPublications: queryStringParameters.numPublications || 0
          };
          state = `${state}|${queryStringParameters.orcidId}|${normalizedHandle}|${orcidData.name}|${JSON.stringify(orcidData.institutions)}|${orcidData.numPublications}`;
          console.log('Updated state with ORCID data:', state);

          // Verify OAuth client is properly initialized
          if (!oauthClient) {
            await initializeOAuthClient();
          }

          if (!oauthClient.keyset) {
            throw new Error('OAuth client keyset not initialized');
          }

          console.log('Initializing Bluesky authorization for handle:', normalizedHandle);
          const url = await oauthClient.authorize(normalizedHandle, {
            state,
            scope: 'atproto',
            redirect_uri: `${PUBLIC_URL}/api/atproto/callback`
          });
          console.log('Authorize URL:', url);

          // Add provider parameter to the URL
          const authUrl = new URL(url);
          authUrl.searchParams.append('provider', 'atproto');
          
          // Store the state in DynamoDB so we can retrieve it later
          const timestamp = Math.floor(Date.now() / 1000);
          console.log('Storing state in DynamoDB:', {
            key: state,
            orcidId: queryStringParameters?.orcidId,
            handle: queryStringParameters?.handle,
            timestamp,
            ttl: timestamp + 3600
          });
          await docClient.send(new PutCommand({
            TableName: process.env.OAUTH_STATE_TABLE,
            Item: {
              key: state,
              orcidId: queryStringParameters?.orcidId,
              handle: queryStringParameters?.handle,
              timestamp,
              ttl: timestamp + 3600 // Expire in 1 hour
            }
          }));
          
          return {
            statusCode: 302,
            headers: {
              Location: authUrl.toString(),
              ...getCorsHeaders(event.headers.origin)
            },
            body: ''
          };
        } else {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Invalid provider' })
          };
        }
      } else {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(event.headers.origin)
          },
          body: JSON.stringify({ error: 'Invalid provider' })
        };
      }
    } else if (path === '/oauth/callback') {
      // Handle callback
      const { code, state, provider = ORCID_PROVIDER, orcidId } = queryStringParameters || {};
      console.log('Callback parameters:', { code, state, provider, orcidId });
      
      if (!code || !state) {
        console.error('Missing required parameters:', { code, state });
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(event.headers.origin)
          },
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
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
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
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Failed to exchange authorization code for token' })
          };
        }

        const tokenData = await tokenResponse.json() as OrcidTokenResponse;
        const accessToken = tokenData.access_token;
        const orcidId = tokenData.orcid;

        if (!accessToken || !orcidId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'No access token or ORCID ID in response' })
          };
        }

        // Get ORCID profile and related data
        const profile = await getOrcidProfile(orcidId);
        if (!profile) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Failed to get ORCID profile' })
          };
        }

        const name = extractNameFromProfile(profile);
        const institutions = await extractVerifiedInstitution(orcidId);
        const works = await fetchOrcidWorks(orcidId);
        const pubmedSearch = await searchPubmedByOrcid(orcidId);
        const pubmedArticles = pubmedSearch ? await fetchPubmedMetadata(pubmedSearch.esearchresult.idlist) : [];

        // Store initial verification data
        await storeVerificationData(
          orcidId,
          '', // Bluesky handle will be added later
          '', // Bluesky DID will be added later
          {
            name,
            institutions,
            works,
            pubmed_articles: pubmedArticles,
            orcid_access_token: accessToken,
            orcid_refresh_token: tokenData.refresh_token,
            orcid_token_expires_in: tokenData.expires_in,
            verification_status: 'pending_bluesky' // Add status to track verification progress
          }
        );

        // Return the ORCID data to the frontend
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(event.headers.origin)
          },
          body: JSON.stringify({ 
            orcidId,
            name,
            institutions: institutions || [],
            numPublications: works?.num_publications || 0,
            status: 'pending_bluesky'
          })
        };
      } else if (provider === ATP_PROVIDER) {
        if (!queryStringParameters) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Missing query parameters' })
          };
        }

        const iss = queryStringParameters.iss;
        if (!iss) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Missing iss parameter' })
          };
        }

        const provider = queryStringParameters.iss;
        if (!provider) {
          return {
            statusCode: 400,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ error: 'Missing provider parameter' })
          };
        }

        if (provider === 'https://orcid.org') {
          // ... existing code ...
        } else if (provider === 'https://bsky.social') {
          const code = queryStringParameters?.code;
          if (!code) {
            return {
              statusCode: 400,
              headers: getCorsHeaders(event.headers.origin),
              body: JSON.stringify({ error: 'Missing code parameter' })
            };
          }

          try {
            // Get the ORCID ID from DynamoDB using the state
            console.log('Retrieving state from DynamoDB:', {
              key: queryStringParameters?.state,
              table: process.env.OAUTH_STATE_TABLE
            });
            const stateResult = await docClient.send(new GetCommand({
              TableName: process.env.OAUTH_STATE_TABLE,
              Key: { key: queryStringParameters?.state }
            }));
            
            console.log('State result from DynamoDB:', {
              found: !!stateResult.Item,
              item: stateResult.Item
            });
            
            // Extract ORCID ID and handle from appState
            const appState = stateResult.Item?.appState;
            if (!appState) {
              console.error('No appState found in state:', {
                state: queryStringParameters?.state,
                stateItem: stateResult.Item
              });
              throw new Error('No appState found for state');
            }

            const stateParts = appState.split('|');
            const extractedOrcidId = stateParts[1];
            const extractedHandle = stateParts[2];
            const orcidData = {
              name: stateParts[3] || '',
              institutions: stateParts[4] ? JSON.parse(stateParts[4]) : [],
              numPublications: parseInt(stateParts[5] || '0')
            };
            
            if (!extractedOrcidId || !extractedHandle) {
              console.error('No ORCID ID or handle found in appState:', {
                appState,
                state: queryStringParameters?.state
              });
              throw new Error('No ORCID ID or handle found in appState');
            }
            
            console.log('Found ORCID data:', { 
              orcidId: extractedOrcidId, 
              handle: extractedHandle,
              orcidData 
            });
            
            // Verify OAuth client is properly initialized
            if (!oauthClient) {
              await initializeOAuthClient();
            }

            if (!oauthClient.keyset) {
              throw new Error('OAuth client keyset not initialized');
            }

            console.log('Initializing Bluesky callback for handle:', extractedHandle);
            const callbackResult = await oauthClient.callback(new URLSearchParams({ 
              code,
              state: queryStringParameters?.state || '',
              iss: queryStringParameters?.iss || 'https://bsky.social'
            }));

            if (!callbackResult || !callbackResult.session) {
              console.error('Failed to create session:', callbackResult);
              throw new Error('Failed to create session');
            }

            // Extract session data
            const oauthSession = callbackResult.session as ExtendedOAuthSession;
            const did = oauthSession.sub;
            
            if (!did) {
              console.error('Missing required session data:', {
                did: !!did,
                session: JSON.stringify(oauthSession, null, 2)
              });
              throw new Error('Missing required session data');
            }

            // Get the token set
            const tokenSet = await oauthSession.getTokenSet();
            
            console.log('Successfully processed callback:', {
              handle: extractedHandle,
              did,
              session: '***'
            });

            // Store verification data in DynamoDB
            const verificationData = {
              orcidId: extractedOrcidId,
              handle: extractedHandle,
              did,
              name: orcidData.name,
              institutions: orcidData.institutions,
              numPublications: orcidData.numPublications,
              status: 'verified',
              verifiedAt: new Date().toISOString(),
              session: {
                accessJwt: tokenSet.access_token,
                refreshJwt: tokenSet.refresh_token,
                handle: oauthSession.handle,
                did: oauthSession.sub,
                service: oauthSession.service
              }
            };

            await docClient.send(new PutCommand({
              TableName: process.env.VERIFICATION_TABLE,
              Item: verificationData
            }));

            // Return success response with ORCID data
            return {
              statusCode: 200,
              headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(event.headers.origin)
              },
              body: JSON.stringify({ 
                success: true,
                orcidId: extractedOrcidId,
                name: orcidData.name,
                institutions: orcidData.institutions,
                numPublications: orcidData.numPublications,
                handle: extractedHandle,
                did
              })
            };
          } catch (error) {
            console.error('Error in Bluesky callback:', error);
            return {
              statusCode: 500,
              headers: getCorsHeaders(event.headers.origin),
              body: JSON.stringify({ error: 'Failed to process Bluesky callback' })
            };
          }
        } else {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(event.headers.origin)
            },
            body: JSON.stringify({ error: 'Invalid provider' })
          };
        }
      } else {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(event.headers.origin)
          },
          body: JSON.stringify({ error: 'Invalid provider' })
        };
      }
    } else if (path === '/labels') {
      try {
        // Check for authorization token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          console.error('Missing or invalid authorization header:', authHeader);
          return {
            statusCode: 401,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ error: 'Missing or invalid authorization token' })
          };
        }

        const token = authHeader.split(' ')[1];
        if (token !== process.env.API_TOKEN) {
          console.error('Invalid token provided:', token);
          return {
            statusCode: 401,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ error: 'Invalid authorization token' })
          };
        }

        const { action, handle, did, data, orcidId } = JSON.parse(event.body || '{}');
        console.log('Received label request:', { action, handle, did, data, orcidId });

        if (!action || !handle || !did) {
          console.error('Missing required parameters:', { action, handle, did });
          return {
            statusCode: 400,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ error: 'Missing required parameters' })
          };
        }

        if (action === 'add') {
          console.log('Adding labels with data:', data);
          await addLabels(handle, did, data);
          return {
            statusCode: 200,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ success: true })
          };
        } else if (action === 'remove') {
          if (!orcidId) {
            console.error('Missing ORCID ID for remove action');
            return {
              statusCode: 400,
              headers: getCorsHeaders(event.headers.origin),
              body: JSON.stringify({ error: 'ORCID ID is required for removing labels' })
            };
          }
          console.log('Removing labels for ORCID:', orcidId);
          await removeLabels(handle, did, orcidId);
          return {
            statusCode: 200,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ success: true })
          };
        } else {
          console.error('Invalid action:', action);
          return {
            statusCode: 400,
            headers: getCorsHeaders(event.headers.origin),
            body: JSON.stringify({ error: 'Invalid action' })
          };
        }
      } catch (error) {
        console.error('Error handling labels:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          event: {
            headers: event.headers,
            body: event.body
          }
        });
        return {
          statusCode: 500,
          headers: getCorsHeaders(event.headers.origin),
          body: JSON.stringify({ error: 'Failed to handle labels' })
        };
      }
    } else {
      console.error('Invalid path:', path);
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(event.headers.origin)
        },
        body: JSON.stringify({ error: 'Not found' })
      };
    }

    // Add default return statement
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(event.headers.origin)
      },
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
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(event.headers.origin)
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      })
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