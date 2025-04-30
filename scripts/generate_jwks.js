require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { JoseKey } = require('@atproto/jwk-jose');

async function generateJwks() {
    try {
        // Load keys from environment variables
        const keys = [];
        for (let i = 1; i <= 3; i++) {
            const privateKey = process.env[`ATP_PRIVATE_KEY_${i}`];
            if (!privateKey) {
                throw new Error(`ATP_PRIVATE_KEY_${i} not found in environment variables`);
            }
            const key = await JoseKey.fromImportable(privateKey, `key${i}`);
            keys.push(key);
        }

        // Create the jwks object
        const jwks = {
            keys: keys.map(key => key.jwk)
        };

        // Ensure directory exists
        const dir = path.join(__dirname, '../frontend/public/oauth');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write the JWKS to file
        fs.writeFileSync(
            path.join(dir, 'jwks.json'),
            JSON.stringify(jwks, null, 2)
        );

        console.log('JWKS has been generated and saved to frontend/public/oauth/jwks.json');
    } catch (error) {
        console.error('Error generating JWKS:', error);
        process.exit(1);
    }
}

generateJwks(); 