#!/bin/bash
set -e

SCRIPT_DIR=$(dirname ${BASH_SOURCE[0]})

$SCRIPT_DIR/setup-demo-users.sh

for i in {1..20}; do
    user_name="user${i}"
    echo "Assigning cluster-admin privileges to ${user_name}"

    oc adm policy add-cluster-role-to-user cluster-admin ${user_name}
    oc adm policy add-cluster-role-to-user view ${user_name}
    oc adm policy add-cluster-role-to-user self-provisioner ${user_name}
done

echo ""
echo "All 20 demo users have been assigned cluster-admin privileges!"
