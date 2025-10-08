#!/bin/bash
set -e

# Password will be generated per user as password${i}

echo "Setting up 20 demo users (user1-user20) with passwords password1-password20..."

# Create combined htpasswd file with all demo users
echo "Creating combined htpasswd file..."
COMBINED_HTPASSWD=""
for i in {1..20}; do
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

echo ""
echo "All 20 demo users created successfully!"
echo "Users: user1, user2, user3, ..., user20"
echo "Passwords: password1, password2, password3, ..., password20"
echo "OAuth Identity Provider: demo-user (single entry)"
echo ""
echo "Example login: oc login -u user1 -p password1"
