#!/bin/bash

# Exit on error
set -e

# Configuration
ENVIRONMENT=${1:-development}
AWS_PROFILE=${AWS_PROFILE:-bsky-scientific-verifier}

# Function to prompt for sensitive input
prompt_for_value() {
    local param_name=$1
    local description=$2
    local secure=$3
    
    echo "Please enter the value for ${description}:"
    if [ "$secure" = "true" ]; then
        read -s value
        echo ""  # Add a newline after silent input
    else
        read value
    fi
    
    if [ "$secure" = "true" ]; then
        aws ssm put-parameter \
            --profile ${AWS_PROFILE} \
            --name "/bsky-labeler/${ENVIRONMENT}/${param_name}" \
            --value "${value}" \
            --type SecureString \
            --overwrite
    else
        aws ssm put-parameter \
            --profile ${AWS_PROFILE} \
            --name "/bsky-labeler/${ENVIRONMENT}/${param_name}" \
            --value "${value}" \
            --type String \
            --overwrite
    fi
}

# Set up parameters
echo "Setting up SSM parameters for the labeler service..."

# Labeler DID
prompt_for_value "did" "Labeler DID" true

# Labeler Signing Key
prompt_for_value "signing-key" "Labeler Signing Key" true

# Turso Database URL
prompt_for_value "db-url" "Turso Database URL (e.g., libsql://bsky-labeler-username.turso.io)" false

# Turso Database Token
prompt_for_value "db-token" "Turso Database Token" true

# Bluesky Identifier
prompt_for_value "bsky-identifier" "Bluesky Identifier" false

# Bluesky Password
prompt_for_value "bsky-password" "Bluesky Password" true

echo "SSM parameters setup complete!" 