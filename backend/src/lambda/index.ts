import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, PutCommandInput, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
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
// import { getBot, getLabeler } from './module-loader';
// import { getBot } from './module-loader';
// import { getBot } from './module-loader.js';

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

// Initialize bot and labeler
// let bot: Bot;
// let labeler: LabelerServer;

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
  num_publications: number;
  publicationYears: number[];
  publicationTypes: string[];
  dois: string[];
  publicationTitles: string[];
  publicationJournals: string[];
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

interface LabelRequest {
  handle: string;
  did: string;
  action: 'add' | 'update' | 'delete';
  labels: {
    orcidId: string;
    numPublications: number;
    firstPubYear?: number;
    lastPubYear?: number;
    institutions?: string[];
  };
}

// async function handleLabels(request: LabelRequest): Promise<void> {
  // const bot = await getBot();
  // const labeler = await getLabeler();

  // try {
  //   const profile = await bot.getProfile(request.did);
    
  //   if (!profile) {
  //     throw new Error('Profile not found');
  //   }

  //   const labels = [];
    
  //   // Add verified scientist label
  //   labels.push('verified-scientist');

  //   // Add publication count label
  //   const pubCountLabel = getPubCountLabel(request.labels.numPublications);
  //   if (pubCountLabel) {
  //     labels.push(pubCountLabel);
  //   }

  //   // Add publication year range label if available
  //   if (request.labels.firstPubYear && request.labels.lastPubYear) {
  //     const yearRangeLabel = getYearRangeLabel(
  //       request.labels.firstPubYear,
  //       request.labels.lastPubYear
  //     );
  //     if (yearRangeLabel) {
  //       labels.push(yearRangeLabel);
  //     }
  //   }

    // // Add institution labels if available
    // if (request.labels.institutions) {
    //   for (const institution of request.labels.institutions) {
    //     labels.push({
    //       val: `institution-${institution.toLowerCase().replace(/\s+/g, '-')}`,
    //       src: process.env.LABELER_DID!,
    //       uri: `at://${request.did}/app.bsky.actor.profile/self`,
    //       neg: request.action === 'delete',
    //     });
    //   }
    // }

//     // If action is delete, negate all labels
//     // If action is add, apply new labels
//     // If action is update, do both
//     if (request.action === 'delete' || request.action === 'update') {
//       const allLabels = ['verified-scientist', 'publications-gte-twofifty', 'publications-onehundred-twofifty', 'publications-fifty-ninetynine', 'publications-ten-fortynine', 'publications-one-nine', 'publication-years-gte-twenty', 'publication-years-ten-nineteen', 'publication-years-five-nine', 'publication-years-zero-four'];
//       await profile.negateAccountLabels(allLabels);
//     }
//     if (request.action === 'add' || request.action === 'update') {
//       await profile.labelAccount(labels);
//     }
//   } catch (error) {
//     console.error('Error handling labels:', error);
//     throw error;
//   }
// }

// // Helper functions for label generation
// function getPubCountLabel(count: number): string {
//   if (count >= 250) return 'publications-gte-twofifty';
//   if (count >= 100) return 'publications-onehundred-twofifty';
//   if (count >= 50) return 'publications-fifty-ninetynine';
//   if (count >= 10) return 'publications-ten-fortynine';
//   return 'publications-one-nine';
// }

// function getYearRangeLabel(firstYear: number, lastYear: number): string {
//   const range = lastYear - firstYear;
//   if (range >= 20) return 'publication-years-gte-twenty';
//   if (range >= 10) return 'publication-years-ten-nineteen';
//   if (range >= 5) return 'publication-years-five-nine';
//   return 'publication-years-zero-four';
// }

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
            numPublications: queryStringParameters.numPublications || 0,
            publicationYears: queryStringParameters.publicationYears || [],
            publicationTypes: queryStringParameters.publicationTypes || [],
            publicationTitles: queryStringParameters.publicationTitles || [],
            publicationJournals: queryStringParameters.publicationJournals || []
          };
          state = `${state}|${queryStringParameters.orcidId}|${normalizedHandle}|${orcidData.name}|${JSON.stringify(orcidData.institutions)}|${orcidData.numPublications}|${JSON.stringify(orcidData.publicationYears)}|${JSON.stringify(orcidData.publicationTypes)}|${JSON.stringify(orcidData.publicationTitles)}|${JSON.stringify(orcidData.publicationJournals)}`;
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
              appState: state,
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
            publicationYears: works?.publicationYears || [],
            publicationTypes: works?.publicationTypes || [],
            publicationTitles: works?.publicationTitles || [],
            publicationJournals: works?.publicationJournals || [],
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
          const code = queryStringParameters?.code;
          if (!code) {
            return {
              statusCode: 400,
              headers: getCorsHeaders(event.headers.origin),
              body: JSON.stringify({ error: 'Missing code parameter' })
            };
          }

          try {
            // Verify OAuth client is properly initialized
            if (!oauthClient) {
              await initializeOAuthClient();
            }

            if (!oauthClient.keyset) {
              throw new Error('OAuth client keyset not initialized');
            }

            // Get the state from DynamoDB
            const stateResult = await docClient.send(new GetCommand({
              TableName: process.env.OAUTH_STATE_TABLE,
              Key: { key: queryStringParameters?.state }
            }));

            if (!stateResult.Item?.appState) {
              throw new Error('No appState found for state');
            }

            // Process the callback
            const callbackResult = await oauthClient.callback(new URLSearchParams({ 
              code,
              state: queryStringParameters?.state || '',
              iss: queryStringParameters?.iss || 'https://orcid.org'
            }));

            if (!callbackResult || !callbackResult.session) {
              throw new Error('Failed to create session');
            }

            // Extract session data
            const oauthSession = callbackResult.session as ExtendedOAuthSession;
            const orcidId = oauthSession.sub;
            
            if (!orcidId) {
              throw new Error('Missing ORCID ID in session');
            }

            // Get the token set
            const tokenSet = await oauthSession.getTokenSet();

            // Fetch ORCID profile data
            const profileResponse = await fetch('https://pub.orcid.org/v3.0/' + orcidId, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${tokenSet.access_token}`
              }
            });

            if (!profileResponse.ok) {
              throw new Error('Failed to fetch ORCID profile');
            }

            const profileData = await profileResponse.json();
            
            // Extract name
            const name = profileData.person?.name?.['given-names']?.value + ' ' + 
                        profileData.person?.name?.['family-name']?.value;

            // Extract institutions
            const institutions = profileData.activities?.affiliations?.['affiliation-group']?.map(
              (group: any) => group.affiliations?.[0]?.affiliation?.['organization']?.name
            ).filter(Boolean) || [];

            // Extract publications
            const works = profileData.activities?.works?.['work-group'] || [];
            const publications = works.map((work: any) => {
              const workData = work.work?.[0];
              return {
                title: workData?.title?.['title']?.value,
                type: workData?.type,
                year: workData?.['publication-date']?.['year']?.value,
                journal: workData?.['journal-title']?.value
              };
            }).filter(Boolean);

            // Process publication data
            const publicationYears = publications
              .map((p: { year?: number }) => p.year)
              .filter(Boolean)
              .map(Number);
            
            const publicationTypes = [...new Set(publications
              .map((p: { type?: string }) => p.type)
              .filter(Boolean))];
            
            const publicationTitles = publications
              .map((p: { title?: string }) => p.title)
              .filter(Boolean);
            
            const publicationJournals = [...new Set(publications
              .map((p: { journal?: string }) => p.journal)
              .filter(Boolean))];

            // Store verification data in DynamoDB
            const verificationData = {
              orcidId,
              name,
              institutions,
              numPublications: publications.length,
              publicationYears,
              publicationTypes,
              publicationTitles,
              publicationJournals,
              status: 'pending_bluesky',
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
                orcidId,
                name,
                institutions,
                numPublications: publications.length,
                publicationYears,
                publicationTypes,
                publicationTitles,
                publicationJournals,
                handle: oauthSession.handle,
                did: oauthSession.sub,
                status: 'verified'
              })
            };
          } catch (error) {
            console.error('Error in ORCID callback:', error);
            return {
              statusCode: 500,
              headers: getCorsHeaders(event.headers.origin),
              body: JSON.stringify({ error: 'Failed to process ORCID callback' })
            };
          }
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
              institutions: stateParts[4] ? JSON.parse(decodeURIComponent(stateParts[4])) : [],
              numPublications: parseInt(stateParts[5] || '0'),
              publicationYears: stateParts[6] ? JSON.parse(decodeURIComponent(stateParts[6])) : [],
              publicationTypes: stateParts[7] ? JSON.parse(decodeURIComponent(stateParts[7])) : [],
              publicationTitles: stateParts[8] ? JSON.parse(decodeURIComponent(stateParts[8])) : [],
              publicationJournals: stateParts[9] ? JSON.parse(decodeURIComponent(stateParts[9])) : []
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
              publicationYears: orcidData.publicationYears,
              publicationTypes: orcidData.publicationTypes,
              publicationTitles: orcidData.publicationTitles,
              publicationJournals: orcidData.publicationJournals,
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
                publicationYears: orcidData.publicationYears,
                publicationTypes: orcidData.publicationTypes,
                publicationTitles: orcidData.publicationTitles,
                publicationJournals: orcidData.publicationJournals,
                handle: extractedHandle,
                did,
                status: 'verified'
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
      if (!event.body) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(event.headers.origin),
          body: JSON.stringify({ error: 'Missing request body' })
        };
      }

      // Forward the request to the Python Lambda function
      const lambda = new LambdaClient({});
      const response = await lambda.send(new InvokeCommand({
        FunctionName: process.env.LABEL_LAMBDA_FUNCTION_NAME || 'bsky-scientific-verifier-label-handler',
        Payload: Buffer.from(event.body)
      }));

      if (!response.Payload) {
        throw new Error('No response from label Lambda function');
      }

      const result = JSON.parse(Buffer.from(response.Payload).toString());
      
      return {
        statusCode: result.statusCode || 200,
        headers: {
          ...getCorsHeaders(event.headers.origin),
          'Content-Type': 'application/json'
        },
        body: result.body
      };
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