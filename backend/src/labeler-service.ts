// import { LabelerServer } from '@skyware/labeler';
// import { setLabelerLabelDefinitions, type LoginCredentials } from '@skyware/labeler/dist/scripts/index.js';

// // Import label definitions from shared location
// import { LABEL_DEFINITIONS } from './shared/labels.js';

// // Initialize labeler server with proper configuration
// const server = new LabelerServer({ 
//   did: process.env.LABELER_DID || '',
//   signingKey: process.env.LABELER_SIGNING_KEY || '',
//   // Use a remote database URL if provided, otherwise use local file
//   dbUrl: process.env.LABELER_DB_URL,
//   dbToken: process.env.LABELER_DB_TOKEN,
//   // Only allow the labeler account to emit labels
//   auth: (did: string) => did === process.env.LABELER_DID
// });

// // Set up label definitions
// const loginCredentials: LoginCredentials = {
//   identifier: process.env.BSKY_IDENTIFIER || '',
//   password: process.env.BSKY_PASSWORD || ''
// };

// // Function to initialize labels
// async function initializeLabels(): Promise<void> {
//   try {
//     await setLabelerLabelDefinitions(loginCredentials, LABEL_DEFINITIONS);
//     console.log('Label definitions set successfully');
//   } catch (error) {
//     console.error('Error setting label definitions:', error);
//     process.exit(1); // Exit if we can't set up labels
//   }
// }

// // Initialize labels and start the server
// async function startServer() {
//   try {
//     await initializeLabels();
    
//     const port = parseInt(process.env.PORT || '14831', 10);
//     server.start(port, (error) => {
//       if (error) {
//         console.error('Failed to start server:', error);
//         process.exit(1);
//       } else {
//         console.log(`Labeler server running on port ${port}`);
//       }
//     });
//   } catch (error) {
//     console.error('Failed to initialize server:', error);
//     process.exit(1);
//   }
// }

// // Start the server
// startServer(); 