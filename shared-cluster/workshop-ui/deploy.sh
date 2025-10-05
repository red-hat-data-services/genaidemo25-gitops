#!/bin/bash

# Workshop UI OpenShift Deployment Script
# This script deploys the workshop UI to OpenShift using BuildConfigs and ImageStreams

set -e

NAMESPACE="workshop-ui"

echo "Deploying Workshop UI to OpenShift..."
echo "   Namespace: $NAMESPACE"

# Check if oc is available
if ! command -v oc &>/dev/null; then
    echo "ERROR: oc CLI is not installed. Please install OpenShift CLI first."
    echo "   Download from: https://mirror.openshift.com/pub/openshift-v4/clients/oc/latest/"
    exit 1
fi

# Check if user is logged in to OpenShift
if ! oc whoami &>/dev/null; then
    echo "ERROR: Not logged in to OpenShift. Please run 'oc login' first."
    exit 1
fi

echo "Logged in as: $(oc whoami)"
echo "Current project: $(oc project -q)"

# Create namespace if it doesn't exist
echo "Creating namespace..."
oc new-project $NAMESPACE --skip-config-write 2>/dev/null || oc project $NAMESPACE

# Ensure we're in the correct namespace
oc project $NAMESPACE

# Create ServiceAccount and RBAC
echo "Creating ServiceAccount and RBAC..."
oc apply -f k8s/serviceaccount.yaml

# Create ImageStreams
echo "Creating ImageStreams..."
oc apply -f k8s/imagestreams.yaml

# Create BuildConfigs
echo "Creating BuildConfigs..."
oc apply -f k8s/buildconfigs.yaml

# Start builds
echo "Starting builds..."
echo "   Building server image..."
oc start-build workshop-server --from-dir=./server --follow &

echo "   Building client image..."
oc start-build workshop-client --from-dir=./client --follow &

wait
# Create PVC for server data
echo "Creating persistent volume claim..."
oc apply -f k8s/pvc.yaml

# Deploy applications
echo "Deploying applications..."
oc apply -f k8s/deployments.yaml
oc apply -f k8s/services.yaml
oc apply -f k8s/route.yaml

# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
oc wait --for=condition=available --timeout=300s deployment/workshop-server -n $NAMESPACE
oc wait --for=condition=available --timeout=300s deployment/workshop-client -n $NAMESPACE

# Get deployment information
echo "Deployment completed!"
echo ""
echo "Pod Status:"
oc get pods -n $NAMESPACE
echo ""
echo "Service Status:"
oc get services -n $NAMESPACE
echo ""
echo "Route Status:"
oc get routes -n $NAMESPACE

# Show access information
echo ""
echo "Application Access:"
CLIENT_ROUTE=$(oc get route workshop-client -o jsonpath='{.spec.host}' 2>/dev/null || echo "Not available")
if [ "$CLIENT_ROUTE" != "Not available" ]; then
    echo "   Client URL: https://$CLIENT_ROUTE"
else
    echo "   Client route not found. Check route status above."
fi

echo ""
echo "To check build logs:"
echo "   oc logs -f buildconfig/workshop-server"
echo "   oc logs -f buildconfig/workshop-client"
echo ""
echo "To check application logs:"
echo "   oc logs -f deployment/workshop-server"
echo "   oc logs -f deployment/workshop-client"
echo ""
echo "To delete the deployment:"
echo "   oc delete project $NAMESPACE"
