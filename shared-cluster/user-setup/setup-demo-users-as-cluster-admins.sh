#!/bin/bash
set -e

SCRIPT_DIR=$(dirname ${BASH_SOURCE[0]})

export DEMO_USER_COUNT=${DEMO_USER_COUNT:-20}

$SCRIPT_DIR/setup-demo-users.sh

CLUSTER_ADMINS_GROUP_NAME=demo-users-group-cluster-admins

echo "Generating and creating group $CLUSTER_ADMINS_GROUP_NAME"

for i in $(seq 1 ${DEMO_USER_COUNT}); do
    user_name="user${i}"
    user_list=$user_list'  '"- $user_name"$'\n'
done

oc apply -f - <<EOF
kind: Group
apiVersion: user.openshift.io/v1
metadata:
  name: demo-users-group-cluster-admins
users:
$user_list
EOF

oc adm policy add-cluster-role-to-group cluster-admin $CLUSTER_ADMINS_GROUP_NAME
oc adm policy add-cluster-role-to-group view $CLUSTER_ADMINS_GROUP_NAME
oc adm policy add-cluster-role-to-group self-provisioner $CLUSTER_ADMINS_GROUP_NAME


echo ""
echo "All $DEMO_USER_COUNT demo users have been assigned cluster-admin privileges!"
