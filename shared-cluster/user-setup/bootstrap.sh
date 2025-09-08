#!/bin/bash

# GitOps Bootstrap Script for OpenShift with ArgoCD
# This script sets up the initial HTPasswd authentication and deploys the root ArgoCD application

set -e

echo "🚀 Starting GitOps bootstrap for OpenShift cluster..."

# Check if required tools are available
if ! command -v oc &> /dev/null; then
    echo "❌ OpenShift CLI (oc) is not installed or not in PATH"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq is not installed or not in PATH (required for JSON manipulation)"
    echo "💡 Install jq: https://stedolan.github.io/jq/download/"
    exit 1
fi

if ! command -v htpasswd &> /dev/null; then
    echo "❌ htpasswd is not installed or not in PATH (usually part of apache2-utils)"
    exit 1
fi

# Check if logged into cluster
if ! oc whoami &> /dev/null; then
    echo "❌ Not logged into OpenShift cluster. Please run 'oc login' first."
    exit 1
fi

echo "✅ Connected to OpenShift cluster: $(oc cluster-info | head -1)"

# Create test user password
echo -n "Enter password for test-user: "
read -s PASSWORD
echo

# Create htpasswd file
echo "📝 Creating htpasswd file..."
htpasswd -c -B -b users.htpasswd test-user "$PASSWORD"

# Create secret
echo "🔐 Creating htpasswd secret..."
oc create secret generic htpass-secret-test-user --from-file=htpasswd=users.htpasswd -n openshift-config --dry-run=client -o yaml | oc apply -f -

# Get current OAuth configuration
echo "🔍 Reading current OAuth configuration..."
CURRENT_PROVIDERS=$(oc get oauth cluster -o jsonpath='{.spec.identityProviders}' 2>/dev/null || echo "[]")

# Check if our provider already exists
if echo "$CURRENT_PROVIDERS" | grep -q '"name":"test-user"'; then
    echo "⚠️  test-user provider already exists, skipping OAuth patch"
else
    # Add our HTPasswd provider to existing OAuth configuration
    echo "🔑 Adding test-user HTPasswd provider to OAuth configuration..."
    
    # Create the new identity provider JSON
    NEW_PROVIDER='{
        "name": "test-user",
        "mappingMethod": "claim", 
        "type": "HTPasswd",
        "htpasswd": {
            "fileData": {
                "name": "htpass-secret-test-user"
            }
        }
    }'
    
    # Patch the OAuth resource to add our provider
    if [ "$CURRENT_PROVIDERS" = "[]" ] || [ "$CURRENT_PROVIDERS" = "null" ]; then
        # No existing providers, create array with our provider
        oc patch oauth cluster --type='merge' -p "{\"spec\":{\"identityProviders\":[$NEW_PROVIDER]}}"
    else
        # Add our provider to existing array
        UPDATED_PROVIDERS=$(echo "$CURRENT_PROVIDERS" | jq ". + [$NEW_PROVIDER]")
        oc patch oauth cluster --type='merge' -p "{\"spec\":{\"identityProviders\":$UPDATED_PROVIDERS}}"
    fi
fi

# Wait a moment for OAuth to restart
echo "⏳ Waiting for OAuth pods to restart..."
sleep 10

# Deploy ArgoCD application for user-setup
echo "🚢 Deploying user-setup ArgoCD application..."
oc apply -f argocd-app.yaml

echo "✅ GitOps bootstrap completed!"
echo ""
echo "📋 Next steps:"
echo "1. Wait for ArgoCD to sync the user-setup application"
echo "2. Check application status: oc get application user-setup -n openshift-gitops"
echo "3. Test user login with credentials:"
echo "   Username: test-user"
echo "   Password: (the password you just entered)"
echo ""
echo "🔍 Monitor sync status:"
echo "   oc get application user-setup -n openshift-gitops -w"

# Cleanup
rm users.htpasswd
