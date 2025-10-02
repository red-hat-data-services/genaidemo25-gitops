#!/bin/bash

set -e

if [[ -z ${CLUSTER_DOMAIN_NAME} ]]; then
    echo "Please set the CLUSTER_DOMAIN_NAME environment variable"
    exit 1
fi

export CLUSTER_DOMAIN_NAME

LITEMAAS_DIR="litemaas/deployment/openshift"

LITEMAAS_GIT_REPO_URL="https://github.com/rh-aiservices-bu/litemaas.git"
LITEMAAS_GIT_REVISION="401ffcd1ece3d5c28083148b36fcefb9479602a7" # v0.0.19

# Checkout repo
if [ ! -d "litemaas" ]; then
    git clone $LITEMAAS_GIT_REPO_URL litemaas
fi

# Check if oc command is available and after that if it is logged in

if ! command -v oc &>/dev/null; then
    echo "oc could not be found, please install it and login to your OpenShift cluster"
    exit 1
fi

if ! oc whoami &>/dev/null; then
    echo "You are not logged in to OpenShift, please login using 'oc login'"
    exit 1
fi

cd litemaas
git fetch
git checkout $LITEMAAS_GIT_REVISION
cd ..

# Generate random strings for secrets
JWT_SECRET=$(openssl rand -base64 32)
OAUTH_CLIENT_SECRET=$(openssl rand -base64 32)
ADMIN_API_KEY=$(openssl rand -hex 16)
LITELLM_API_KEY=$(openssl rand -hex 16)

# Export the generated values for use in templates
export JWT_SECRET
export OAUTH_CLIENT_SECRET
export ADMIN_API_KEY
export LITELLM_API_KEY

cp -r config/* $LITEMAAS_DIR
cd $LITEMAAS_DIR

./preparation.sh
oc project litemaas || oc new-project litemaas
oc apply -k .

# Patch the backend deployment to disable TLS verification (ocp oauth provider uses self-signed cert)
oc patch deployment backend -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","env":[{"name":"NODE_TLS_REJECT_UNAUTHORIZED","value":"0"}]}]}}}}'
