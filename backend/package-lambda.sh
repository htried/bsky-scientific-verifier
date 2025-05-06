#!/bin/bash

# Clean up old files
rm -rf src/lambda/label-function.zip
rm -rf src/lambda/package
rm -rf src/lambda/layer.zip

# Create directories for packaging
mkdir -p src/lambda/package
mkdir -p src/lambda/layer/python/lib/python3.9/site-packages

# Create a temporary install script for the function package
cat > src/lambda/install.sh << 'EOF'
#!/bin/bash
cd /var/task
echo "Installing packages for function..."
/var/lang/bin/pip install -r requirements.txt --target ./package --no-cache-dir
echo "Installed packages:"
/var/lang/bin/pip list
echo "Package contents:"
ls -la ./package
EOF

# Create a temporary install script for the layer
cat > src/lambda/install-layer.sh << 'EOF'
#!/bin/bash
cd /var/task
echo "Installing packages for layer..."
/var/lang/bin/pip install atproto --target ./layer/python/lib/python3.9/site-packages --no-cache-dir
echo "Layer package contents:"
ls -la ./layer/python/lib/python3.9/site-packages/atproto
EOF

chmod +x src/lambda/install.sh
chmod +x src/lambda/install-layer.sh

# Use Docker to install dependencies in a Lambda-like environment
echo "Installing function dependencies..."
docker run --rm \
    --entrypoint /bin/bash \
    -v "$(pwd)/src/lambda:/var/task:rw" \
    public.ecr.aws/lambda/python:3.9 \
    -c "cd /var/task && ./install.sh"

echo "Installing layer dependencies..."
docker run --rm \
    --entrypoint /bin/bash \
    -v "$(pwd)/src/lambda:/var/task:rw" \
    public.ecr.aws/lambda/python:3.9 \
    -c "cd /var/task && ./install-layer.sh"

# Clean up install scripts
rm src/lambda/install.sh
rm src/lambda/install-layer.sh

# Copy the Lambda function code
cp src/lambda/label_handler.py ./src/lambda/package/

# Create the deployment packages
echo "Creating function package..."
cd src/lambda/package && zip -r ../label-function.zip . && cd ../../../

echo "Creating layer package..."
cd src/lambda/layer && zip -r ../layer.zip . && cd ../../../

# Clean up
rm -rf src/lambda/package
rm -rf src/lambda/layer

echo "Packaging complete!"
echo "Function package: src/lambda/label-function.zip"
echo "Layer package: src/lambda/layer.zip"