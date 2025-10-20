#!/bin/bash
set -e

# Load test user and password from environment variables, with defaults if not set
TEST_USER="${TEST_USER:-demo-admin}"
TEST_PASSWORD="${TEST_PASSWORD:-password123}"

echo "Setting up ${TEST_USER} with ${TEST_PASSWORD}..."

# Check if htpasswd secret already exists
if oc get secret htpass-secret-demo-admin -n openshift-config >/dev/null 2>&1; then
    echo "htpasswd secret for ${TEST_USER} already exists, updating..."
else
    echo "Creating htpasswd secret for ${TEST_USER}..."
fi

# Create or update htpasswd secret
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

# Check if OAuth identity provider already exists
if oc get oauth cluster -o jsonpath='{.spec.identityProviders[*].name}' | grep -q "demo-admin"; then
    echo "OAuth identity provider 'demo-admin' already exists, skipping..."
else
    echo "Adding ${TEST_USER} to OAuth configuration..."
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
fi

# Check and assign cluster admin permissions (idempotent operations)
echo "Checking and assigning cluster roles to ${TEST_USER}..."

# Check if user already has cluster-admin role
if oc get clusterrolebinding cluster-admin -o jsonpath='{.subjects[*].name}' | grep -q "^${TEST_USER}$"; then
    echo "${TEST_USER} already has cluster-admin role"
else
    echo "Assigning cluster-admin role to ${TEST_USER}..."
    oc adm policy add-cluster-role-to-user cluster-admin ${TEST_USER}
fi

# Check if user already has view role
if oc get clusterrolebinding view -o jsonpath='{.subjects[*].name}' | grep -q "^${TEST_USER}$"; then
    echo "${TEST_USER} already has view role"
else
    echo "Assigning view role to ${TEST_USER}..."
    oc adm policy add-cluster-role-to-user view ${TEST_USER}
fi

# Check if user already has self-provisioner role
if oc get clusterrolebinding self-provisioner -o jsonpath='{.subjects[*].name}' | grep -q "^${TEST_USER}$"; then
    echo "${TEST_USER} already has self-provisioner role"
else
    echo "Assigning self-provisioner role to ${TEST_USER}..."
    oc adm policy add-cluster-role-to-user self-provisioner ${TEST_USER}
fi

echo "${TEST_USER} created successfully!"
echo "Login with: oc login -u ${TEST_USER} -p ${TEST_PASSWORD}"
