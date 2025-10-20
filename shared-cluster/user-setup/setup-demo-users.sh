#!/bin/bash
set -e

# Password will be generated per user as password${i}

DEMO_USER_COUNT=${DEMO_USER_COUNT:-20}

echo "Setting up ${DEMO_USER_COUNT} demo users (user1-user20) with passwords password1-password20..."

# Check if htpasswd secret already exists
if oc get secret htpass-secret-demo-users -n openshift-config >/dev/null 2>&1; then
    echo "htpasswd secret for demo users already exists, updating..."
else
    echo "Creating htpasswd secret for demo users..."
fi

# Create combined htpasswd file with all demo users
echo "Creating combined htpasswd file..."
COMBINED_HTPASSWD=""
for i in {1..${DEMO_USER_COUNT}}; do
    user_name="user${i}"
    user_password="password${i}"
    echo "Adding ${user_name} to htpasswd file with password ${user_password}..."

    # Generate htpasswd entry for this user
    HTPASSWD_ENTRY=$(htpasswd -nbB "${user_name}" "${user_password}")

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

# Check if OAuth identity provider already exists
if oc get oauth cluster -o jsonpath='{.spec.identityProviders[*].name}' | grep -q "demo-user"; then
    echo "OAuth identity provider 'demo-user' already exists, skipping..."
else
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
fi

echo ""
echo "All demo users have been set up successfully!"
echo "Users: user1, user2, user3, ..., user${DEMO_USER_COUNT}"
echo "Passwords: password1, password2, password3, ..., password20"
echo "OAuth Identity Provider: demo-user (single entry)"
echo ""
echo "Example login: oc login -u user1 -p password1"
