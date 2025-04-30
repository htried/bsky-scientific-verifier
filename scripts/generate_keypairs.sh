#!/bin/bash

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    touch .env
fi

# Function to convert PEM to single line
pem_to_single_line() {
    local pem_file=$1
    awk 'NF {gsub(/\n/, ""); printf "%s", $0;}' "$pem_file"
}

# Generate 3 key pairs
for i in {1..3}; do
    echo "Generating key pair $i..."
    
    # Generate private key
    openssl genpkey -algorithm RSA -out "private_key_$i.pem" -pkeyopt rsa_keygen_bits:2048
    
    # Generate public key
    openssl rsa -pubout -in "private_key_$i.pem" -out "public_key_$i.pem"
    
    # Convert to single line and save to .env
    PRIVATE_KEY=$(pem_to_single_line "private_key_$i.pem")
    PUBLIC_KEY=$(pem_to_single_line "public_key_$i.pem")
    
    # Add to .env file
    echo "ATP_PRIVATE_KEY_$i='$PRIVATE_KEY'" >> .env
    echo "ATP_PUBLIC_KEY_$i='$PUBLIC_KEY'" >> .env
    
    # Clean up PEM files
    rm "private_key_$i.pem" "public_key_$i.pem"
done

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "ATP_JWT_SECRET='$JWT_SECRET'" >> .env

echo "Keys have been generated and saved to .env file."
echo "You can now add these environment variables to your Vercel project:"
echo "1. Go to your Vercel project settings"
echo "2. Navigate to the 'Environment Variables' section"
echo "3. Add each of the following variables:"
echo "   - ATP_PRIVATE_KEY_1"
echo "   - ATP_PRIVATE_KEY_2"
echo "   - ATP_PRIVATE_KEY_3"
echo "   - ATP_PUBLIC_KEY_1"
echo "   - ATP_PUBLIC_KEY_2"
echo "   - ATP_PUBLIC_KEY_3"
echo "   - ATP_JWT_SECRET" 