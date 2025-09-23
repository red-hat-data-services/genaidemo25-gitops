#!/bin/bash
set -e

# Load password from environment variable, with default if not set
TEST_PASSWORD="${TEST_PASSWORD:-password123}"

echo "Setting up 20 demo users (demo01-demo20) with password: ${TEST_PASSWORD}..."

# Create combined htpasswd file with all demo users
echo "Creating combined htpasswd file..."
COMBINED_HTPASSWD=""
for i in {01..20}; do
    user_name="demo${i}"
    echo "Adding ${user_name} to htpasswd file..."

    # Generate htpasswd entry for this user
    HTPASSWD_ENTRY=$(htpasswd -nbB "${user_name}" "${TEST_PASSWORD}")

    if [ -z "$COMBINED_HTPASSWD" ]; then
        COMBINED_HTPASSWD="$HTPASSWD_ENTRY"
    else
        COMBINED_HTPASSWD="$COMBINED_HTPASSWD"$'\n'"$HTPASSWD_ENTRY"
    fi
done

# Base64 encode the combined htpasswd file
COMBINED_HTPASSWD_B64=$(echo -n "$COMBINED_HTPASSWD" | base64 -w 0)

echo "Creating single htpasswd secret for all demo users..."

# Create one secret with all demo users
oc apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: htpass-secret-demo-users
  namespace: openshift-config
type: Opaque
data:
  htpasswd: ${COMBINED_HTPASSWD_B64}
EOF

echo "Creating single OAuth identity provider..."

# Add one OAuth identity provider for all demo users
oc patch oauth cluster --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/identityProviders/-",
    "value": {
      "name": "demo-user",
      "mappingMethod": "claim",
      "type": "HTPasswd",
      "htpasswd": {
        "fileData": {
          "name": "htpass-secret-demo-users"
        }
      }
    }
  }
]'

echo "Creating individual User and Identity objects..."

# Function to create user and identity objects
create_user_and_identity() {
    local user_name=$1

    echo "Creating User and Identity objects for: ${user_name}"

    # Create user object
    oc apply -f - <<EOF
apiVersion: user.openshift.io/v1
kind: User
metadata:
  name: ${user_name}
identities:
- demo-user:${user_name}
fullName: Demo User ${user_name}
EOF

    # Get the user UID and create identity with matching UID
    USER_UID=$(oc get user ${user_name} -o jsonpath='{.metadata.uid}')

    oc apply -f - <<EOF
apiVersion: user.openshift.io/v1
kind: Identity
metadata:
  name: demo-user:${user_name}
providerName: demo-user
providerUserName: ${user_name}
user:
  name: ${user_name}
  uid: ${USER_UID}
EOF

    # Give basic permissions (normal user permissions)
    oc adm policy add-cluster-role-to-user view ${user_name}
    oc adm policy add-cluster-role-to-user self-provisioner ${user_name}

    echo "${user_name} created successfully!"
}

# Create User and Identity objects for all demo users
for i in {01..20}; do
    user_name="demo${i}"
    create_user_and_identity "${user_name}"

    # Small delay to avoid overwhelming the API server
    sleep 0.5
done

echo ""
echo "All 20 demo users created successfully!"
echo "Users: demo01, demo02, demo03, ..., demo20"
echo "Password for all users: ${TEST_PASSWORD}"
echo "OAuth Identity Provider: demo-user (single entry)"
echo ""
echo "Example login: oc login -u demo01 -p ${TEST_PASSWORD}"
