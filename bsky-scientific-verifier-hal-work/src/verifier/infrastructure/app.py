#!/usr/bin/env python3
from aws_cdk import App

from stack import VerificationServiceStack

app = App()
VerificationServiceStack(app, "BlueskyVerificationService")

app.synth() 