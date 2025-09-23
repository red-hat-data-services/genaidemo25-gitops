#!/bin/bash
set -e

# Load test user and password from environment variables, with defaults if not set
TEST_USER="${TEST_USER:-demo-admin}"
TEST_PASSWORD="${TEST_PASSWORD:-password123}"

echo "Setting up ${TEST_USER} with ${TEST_PASSWORD}..."

# Create htpasswd secret
HTPASSWD_HASH=$(htpasswd -nbB "${TEST_USER}" "${TEST_PASSWORD}" | base64 -w 0)

oc apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: htpass-secret-demo-admin
  namespace: openshift-config
type: Opaque
data:
  htpasswd: ${HTPASSWD_HASH}
EOF

# Add test user to OAuth configuration (preserves existing identity providers)
oc patch oauth cluster --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/identityProviders/-",
    "value": {
      "name": "demo-admin",
      "mappingMethod": "claim",
      "type": "HTPasswd",
      "htpasswd": {
        "fileData": {
          "name": "htpass-secret-demo-admin"
        }
      }
    }
  }
]'

# Give basic permissions
oc adm policy add-cluster-role-to-user view ${TEST_USER}
oc adm policy add-cluster-role-to-user self-provisioner ${TEST_USER}

echo "${TEST_USER} created successfully!"
echo "Login with: oc login -u ${TEST_USER} -p ${TEST_PASSWORD}"
