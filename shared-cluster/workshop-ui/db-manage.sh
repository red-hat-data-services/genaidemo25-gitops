#!/bin/bash

# Database Management Script for Workshop UI
# This script works with both Podman (local) and OpenShift (inside pods)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment detection
detect_environment() {
    if [ -n "$KUBERNETES_SERVICE_HOST" ] || [ -n "$OPENSHIFT_BUILD_NAME" ]; then
        # Running inside OpenShift/Kubernetes
        ENVIRONMENT="openshift"
        DB_PATH="/app/data/workshop.db"
        echo "Detected environment: OpenShift (running inside pod)"
    elif command -v podman &>/dev/null && podman ps --format "{{.Names}}" | grep -q "workshop-server"; then
        # Running locally with Podman
        ENVIRONMENT="podman"
        CONTAINER_NAME="workshop-server"
        DB_PATH="/app/data/workshop.db"
        echo "Detected environment: Podman (local development)"
    elif command -v oc &>/dev/null && oc whoami &>/dev/null; then
        # Running locally but connected to OpenShift
        ENVIRONMENT="oc-local"
        DB_PATH="/app/data/workshop.db"
        echo "Detected environment: OpenShift CLI (local)"
    else
        echo -e "${RED}Error: No suitable environment detected${NC}"
        echo "This script requires one of:"
        echo "  - Running inside an OpenShift pod"
        echo "  - Podman with workshop-server container running"
        echo "  - OpenShift CLI (oc) with active session"
        exit 1
    fi
}

# Function to run Node.js commands
run_db_command() {
    local command="$1"

    case $ENVIRONMENT in
    "openshift")
        # Running inside the pod - execute directly
        node -e "$command"
        ;;
    "podman")
        # Running locally with Podman
        podman exec $CONTAINER_NAME node -e "$command"
        ;;
    "oc-local")
        # Running locally with oc CLI
        oc exec deployment/workshop-server -- node -e "$command"
        ;;
    esac
}

# Function to show cluster status
show_status() {
    echo -e "${BLUE}=== Cluster Status ===${NC}"
    run_db_command "
        const Database = require('better-sqlite3');
        const db = new Database('$DB_PATH');
        const clusters = db.prepare('SELECT id, name, is_reserved, reserved_by FROM clusters').all();
        clusters.forEach(c => console.log(\`ID: \${c.id}, Name: \${c.name}, Reserved: \${c.is_reserved}, By: \${c.reserved_by}\`));
        db.close();
    "

    echo -e "\n${BLUE}=== Demo Users Status (first 10) ===${NC}"
    run_db_command "
        const Database = require('better-sqlite3');
        const db = new Database('$DB_PATH');
        const demoUsers = db.prepare('SELECT id, cluster_id, username, is_reserved, reserved_by FROM demo_users LIMIT 10').all();
        demoUsers.forEach(u => console.log(\`ID: \${u.id}, Cluster: \${u.cluster_id}, User: \${u.username}, Reserved: \${u.is_reserved}, By: \${u.reserved_by}\`));
        db.close();
    "
}

# Function to release a specific cluster
release_cluster() {
    local cluster_id=$1
    if [ -z "$cluster_id" ]; then
        echo -e "${RED}Error: Cluster ID is required${NC}"
        echo "Usage: $0 release <cluster_id>"
        exit 1
    fi

    echo -e "${YELLOW}Releasing cluster $cluster_id...${NC}"
    run_db_command "
        const Database = require('better-sqlite3');
        const db = new Database('$DB_PATH');
        db.prepare('UPDATE clusters SET is_reserved = 0, reserved_by = NULL, reserved_at = NULL WHERE id = ?').run($cluster_id);
        db.prepare('UPDATE demo_users SET is_reserved = 0, reserved_by = NULL, reserved_at = NULL WHERE cluster_id = ?').run($cluster_id);
        console.log('Cluster $cluster_id released successfully!');
        db.close();
    "
}

# Function to release all clusters
release_all() {
    echo -e "${YELLOW}Releasing all clusters...${NC}"
    run_db_command "
        const Database = require('better-sqlite3');
        const db = new Database('$DB_PATH');
        db.prepare('UPDATE clusters SET is_reserved = 0, reserved_by = NULL, reserved_at = NULL').run();
        db.prepare('UPDATE demo_users SET is_reserved = 0, reserved_by = NULL, reserved_at = NULL').run();
        console.log('All clusters released successfully!');
        db.close();
    "
}

# Function to reset all workshop users
reset_users() {
    echo -e "${YELLOW}Resetting all workshop users...${NC}"
    run_db_command "
        const Database = require('better-sqlite3');
        const db = new Database('$DB_PATH');
        db.prepare('DELETE FROM workshop_users').run();
        console.log('All workshop users deleted!');
        db.close();
    "
}

# Function to add a new cluster
add_cluster() {
    local name=$1
    local url=$2
    local username=$3
    local password=$4

    if [ -z "$name" ] || [ -z "$url" ] || [ -z "$username" ] || [ -z "$password" ]; then
        echo -e "${RED}Error: All parameters are required${NC}"
        echo "Usage: $0 add-cluster <name> <url> <username> <password>"
        exit 1
    fi

    echo -e "${YELLOW}Adding new cluster: $name${NC}"
    run_db_command "
        const Database = require('better-sqlite3');
        const db = new Database('$DB_PATH');
        const result = db.prepare('INSERT INTO clusters (name, url, username, password) VALUES (?, ?, ?, ?)').run('$name', '$url', '$username', '$password');
        console.log('Cluster added with ID:', result.lastInsertRowid);
        
        // Add 20 demo users for this cluster with unique usernames
        const clusterId = result.lastInsertRowid;
        for (let i = 1; i <= 20; i++) {
            const username = \`\${clusterId}-demo-user-\${i}\`;
            const password = \`\${clusterId}-demo-pass-\${i}\`;
            db.prepare('INSERT INTO demo_users (cluster_id, username, password) VALUES (?, ?, ?)').run(clusterId, username, password);
        }
        console.log('Added 20 demo users for cluster $name');
        db.close();
    "
}

# Function to show help
show_help() {
    echo -e "${BLUE}Database Management Script for Workshop UI${NC}"
    echo ""
    echo "This script works in multiple environments:"
    echo "  - Podman (local development)"
    echo "  - OpenShift CLI (oc exec)"
    echo "  - Inside OpenShift pods"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo -e "${GREEN}Commands:${NC}"
    echo "  status                    - Show current cluster and user status"
    echo "  release <cluster_id>      - Release a specific cluster"
    echo "  release-all              - Release all clusters"
    echo "  reset-users              - Delete all workshop users"
    echo "  add-cluster <name> <url> <username> <password> - Add a new cluster with demo users"
    echo "  help                     - Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 status"
    echo "  $0 release 1"
    echo "  $0 release-all"
    echo "  $0 add-cluster cluster-6 https://cluster6.example.com admin admin123"
    echo ""
    echo -e "${YELLOW}Usage in different environments:${NC}"
    echo "  Local (Podman):     ./db-manage.sh status"
    echo "  OpenShift CLI:      oc exec deployment/workshop-server -- ./db-manage.sh status"
    echo "  Inside pod:         ./db-manage.sh status"
}

# Main script logic
# Detect environment first
#detect_environment

case "$1" in
"status")
    show_status
    ;;
"release")
    release_cluster "$2"
    ;;
"release-all")
    release_all
    ;;
"reset-users")
    reset_users
    ;;
"add-cluster")
    add_cluster "$2" "$3" "$4" "$5"
    ;;
"help" | "")
    show_help
    ;;
*)
    echo -e "${RED}Unknown command: $1${NC}"
    show_help
    exit 1
    ;;
esac
