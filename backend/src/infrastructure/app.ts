#!/usr/bin/env node
import 'source-map-support/source-map-support.js';
import { App } from 'aws-cdk-lib';
import { BackendStack } from './stack.ts';

const app = new App();
new BackendStack(app, 'BskyScientificVerifierBackend', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});

app.synth(); 