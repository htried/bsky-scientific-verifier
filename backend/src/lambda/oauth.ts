import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AtpAgent } from '@atproto/api';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verificationTable = process.env.VERIFICATION_TABLE || 'verifications';

export const handler = async (event: any) => {
    try {
        const { action, verification_id, code, state } = JSON.parse(event.body);

        if (action === 'initiate') {
            // Get verification record
            const verification = await docClient.send(
                new GetCommand({
                    TableName: verificationTable,
                    Key: {
                        PK: `VERIFICATION#${verification_id}`,
                        SK: 'PROFILE'
                    }
                })
            );

            if (!verification.Item) {
                throw new Error('Verification not found');
            }

            if (verification.Item.verification_status !== 'ORCID_VERIFIED') {
                throw new Error('ORCID verification required before Bluesky');
            }

            const agent = new AtpAgent({ service: process.env.ATP_HANDLE_RESOLVER || 'https://bsky.social' });
            const authUrl = await agent.com.atproto.server.createSession({
                identifier: verification.Item.orcid_id,
                password: state // Using state as a temporary password
            });

            return {
                statusCode: 200,
                body: JSON.stringify({ authUrl: authUrl.data.authorizationUrl })
            };
        }

        if (action === 'callback') {
            // Get verification record
            const verification = await docClient.send(
                new GetCommand({
                    TableName: verificationTable,
                    Key: {
                        PK: `VERIFICATION#${verification_id}`,
                        SK: 'PROFILE'
                    }
                })
            );

            if (!verification.Item) {
                throw new Error('Verification not found');
            }

            const agent = new AtpAgent({ service: process.env.ATP_HANDLE_RESOLVER || 'https://bsky.social' });
            const session = await agent.com.atproto.server.createSession({
                identifier: verification.Item.orcid_id,
                password: code // Using code as password for simplicity
            });

            // Update verification record with Bluesky DID
            await docClient.send(
                new UpdateCommand({
                    TableName: verificationTable,
                    Key: {
                        PK: `VERIFICATION#${verification_id}`,
                        SK: 'PROFILE'
                    },
                    UpdateExpression: 'SET bluesky_did = :did, verification_status = :status',
                    ExpressionAttributeValues: {
                        ':did': session.data.did,
                        ':status': 'VERIFIED'
                    }
                })
            );

            return {
                statusCode: 200,
                body: JSON.stringify({
                    verification_id,
                    bluesky_did: session.data.did,
                    status: 'VERIFIED'
                })
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid action' })
        };
    } catch (error: any) {
        console.error('OAuth error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}; 