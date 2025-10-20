#!/bin/bash
set -e

SCRIPT_DIR=$(dirname ${BASH_SOURCE[0]})

$SCRIPT_DIR/setup-demo-users.sh

echo "Checking and assigning cluster-admin privileges to demo users..."

for i in {1..20}; do
    user_name="user${i}"
    echo "Checking cluster roles for ${user_name}..."

    # Check if user already has cluster-admin role
    if oc get clusterrolebinding cluster-admin -o jsonpath='{.subjects[*].name}' | grep -q "^${user_name}$"; then
        echo "${user_name} already has cluster-admin role"
    else
        echo "Assigning cluster-admin role to ${user_name}..."
        oc adm policy add-cluster-role-to-user cluster-admin ${user_name}
    fi

    # Check if user already has view role
    if oc get clusterrolebinding view -o jsonpath='{.subjects[*].name}' | grep -q "^${user_name}$"; then
        echo "${user_name} already has view role"
    else
        echo "Assigning view role to ${user_name}..."
        oc adm policy add-cluster-role-to-user view ${user_name}
    fi

    # Check if user already has self-provisioner role
    if oc get clusterrolebinding self-provisioner -o jsonpath='{.subjects[*].name}' | grep -q "^${user_name}$"; then
        echo "${user_name} already has self-provisioner role"
    else
        echo "Assigning self-provisioner role to ${user_name}..."
        oc adm policy add-cluster-role-to-user self-provisioner ${user_name}
    fi
done

echo ""
echo "All 20 demo users have been assigned cluster-admin privileges!"
