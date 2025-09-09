#!/bin/bash
set -e

# Load test user and password from environment variables, with defaults if not set
TEST_USER="${TEST_USER:-test-user}"
TEST_PASSWORD="${TEST_PASSWORD:-password123}"

echo "Setting up ${TEST_USER} with ${TEST_PASSWORD}..."

# Create htpasswd secret
HTPASSWD_HASH=$(htpasswd -nbB "${TEST_USER}" "${TEST_PASSWORD}" | base64 -w 0)

oc apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: htpass-secret-test-user
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
      "name": "test-user-htpasswd",
      "mappingMethod": "claim",
      "type": "HTPasswd",
      "htpasswd": {
        "fileData": {
          "name": "htpass-secret-test-user"
        }
      }
    }
  }
]'

# Create user and identity
oc apply -f - <<EOF
apiVersion: user.openshift.io/v1
kind: User
metadata:
  name: ${TEST_USER}
identities:
- test-user-htpasswd:${TEST_USER}
fullName: Test User
EOF

# Get the user UID and create identity with matching UID
USER_UID=$(oc get user ${TEST_USER} -o jsonpath='{.metadata.uid}')

oc apply -f - <<EOF
apiVersion: user.openshift.io/v1
kind: Identity
metadata:
  name: test-user-htpasswd:${TEST_USER}
providerName: test-user-htpasswd
providerUserName: ${TEST_USER}
user:
  name: ${TEST_USER}
  uid: ${USER_UID}
EOF

# Give basic permissions
oc adm policy add-cluster-role-to-user view ${TEST_USER}
oc adm policy add-cluster-role-to-user self-provisioner ${TEST_USER}

echo "✅ ${TEST_USER} created successfully!"
echo "Login with: oc login -u ${TEST_USER} -p ${TEST_PASSWORD}"
