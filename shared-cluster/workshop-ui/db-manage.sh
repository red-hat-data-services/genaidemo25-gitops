#!/bin/bash

# Database Management Script for Workshop UI
# This script works with both Podman (local) and OpenShift (inside pods)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment setup
setup_environment() {
    if [ -z "$ENVIRONMENT" ]; then
        echo -e "${RED}Error: ENVIRONMENT variable must be set${NC}"
        echo "Set ENVIRONMENT to one of:"
        echo "  - 'openshift' (for running inside OpenShift pod)"
        echo "  - 'podman' (for local Podman development)"
        exit 1
    fi

    case $ENVIRONMENT in
    "openshift")
        CONTAINER_NAME="deployment/workshop-server"
        echo "Environment: OpenShift (running inside pod)"
        ;;
    "podman")
        CONTAINER_NAME="workshop-server"
        echo "Environment: Podman (local development)"
        ;;
    *)
        echo -e "${RED}Error: Invalid ENVIRONMENT value${NC}"
        echo "Valid values: openshift, podman"
        exit 1
        ;;
    esac
}

# Function to get the actual pod name for OpenShift
get_pod_name() {
    case $ENVIRONMENT in
    "openshift")
        oc get pods -l app=workshop-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null
        ;;
    "podman")
        echo "$CONTAINER_NAME"
        ;;
    esac
}

# Function to run database commands using Prisma
run_db_command() {
    local command="$1"
    shift
    local args="$@"
    
    case $ENVIRONMENT in
    "openshift")
        local pod_name=$(get_pod_name)
        if [ -z "$pod_name" ]; then
            echo -e "${RED}Error: No workshop-server pod found${NC}"
            exit 1
        fi
        oc exec "$pod_name" -- node /app/db-manage-prisma.js "$command" $args
        ;;
    "podman")
        podman exec $CONTAINER_NAME node /app/db-manage-prisma.js "$command" $args
        ;;
    esac
}

# Function to show cluster status
show_status() {
    run_db_command "status"
}

# Function to list all demo users
list_demo_users() {
    run_db_command "list-demo-users"
}

# Function to release a specific cluster
release_cluster() {
    local cluster_id=$1
    if [ -z "$cluster_id" ]; then
        echo -e "${RED}Error: Cluster ID is required${NC}"
        echo "Usage: $0 release <cluster_id>"
        exit 1
    fi
    
    echo -e "${YELLOW}Releasing cluster $cluster_id${NC}"
    run_db_command "release" "$cluster_id"
}

# Function to release all clusters
release_all() {
    echo -e "${YELLOW}Releasing all clusters...${NC}"
    run_db_command "release-all"
}

# Function to reset all workshop users
reset_users() {
    echo -e "${YELLOW}Resetting all workshop users...${NC}"
    run_db_command "reset-users"
}

# Function to add a single cluster (no demo users)
add_cluster() {
    local name=$1
    local url=$2

    if [ -z "$name" ] || [ -z "$url" ]; then
        echo -e "${RED}Error: Name and URL are required${NC}"
        echo "Usage: $0 add-cluster <name> <url>"
        exit 1
    fi

    echo -e "${YELLOW}Adding cluster: $name${NC}"
    run_db_command "add-cluster" "$name" "$url"
}

# Function to add a single demo user (global, not tied to specific cluster)
add_demo_user() {
    local username=$1
    local password=$2

    if [ -z "$username" ] || [ -z "$password" ]; then
        echo -e "${RED}Error: Username and password are required${NC}"
        echo "Usage: $0 add-demo-user <username> <password>"
        exit 1
    fi

    echo -e "${YELLOW}Adding global demo user '$username'${NC}"
    run_db_command "add-demo-user" "$username" "$password"
}

# Function to add a shared cluster
add_shared_cluster() {
    local name=$1
    local url=$2

    if [ -z "$name" ] || [ -z "$url" ]; then
        echo -e "${RED}Error: Name and URL are required${NC}"
        echo "Usage: $0 add-shared-cluster <name> <url>"
        exit 1
    fi

    echo -e "${YELLOW}Adding shared cluster: $name${NC}"
    run_db_command "add-shared-cluster" "$name" "$url"
}

# Function to load data from YAML file
load_yaml() {
    local yaml_file=$1
    
    if [ -z "$yaml_file" ]; then
        echo -e "${RED}Error: YAML file path is required${NC}"
        echo "Usage: $0 load-yaml <yaml_file>"
        exit 1
    fi
    
    if [ ! -f "$yaml_file" ]; then
        echo -e "${RED}Error: YAML file '$yaml_file' not found${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Loading data from YAML file: $yaml_file${NC}"
    
    case $ENVIRONMENT in
    "openshift")
        local pod_name=$(get_pod_name)
        if [ -z "$pod_name" ]; then
            echo -e "${RED}Error: No workshop-server pod found${NC}"
            exit 1
        fi
        
        # Copy YAML file to pod
        oc cp "$yaml_file" "$pod_name:/tmp/yaml_data.yaml"
        
        # Run the load command
        oc exec "$pod_name" -- node /app/db-manage-prisma.js "load-yaml" "/tmp/yaml_data.yaml"
        
        # Clean up the temporary file
        oc exec "$pod_name" -- rm -f /tmp/yaml_data.yaml
        ;;
    "podman")
        # Copy YAML file to container
        podman cp "$yaml_file" "$CONTAINER_NAME:/tmp/yaml_data.yaml"
        
        # Run the load command
        podman exec "$CONTAINER_NAME" node /app/db-manage-prisma.js "load-yaml" "/tmp/yaml_data.yaml"
        
        # Clean up the temporary file
        podman exec "$CONTAINER_NAME" rm -f /tmp/yaml_data.yaml
        ;;
    esac
}

# Function to cleanup all data
cleanup_all() {
    echo -e "${RED}WARNING: This will completely clean up the entire database!${NC}"
    echo -e "${RED}This will delete ALL clusters, demo users, and workshop users!${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}Cleanup cancelled.${NC}"
        exit 0
    fi
    
    echo -e "${YELLOW}Performing complete database cleanup...${NC}"
    run_db_command "cleanup-all"
}

# Function to show help
show_help() {
    echo -e "${BLUE}Database Management Script for Workshop UI${NC}"
    echo ""
    echo "This script works in two environments:"
    echo "  - Podman (local development)"
    echo "  - OpenShift (connects to cluster via oc exec)"
    echo ""
    echo "Usage: ENVIRONMENT=<env> ./db-manage.sh <command> [args]"
    echo ""
    echo -e "${YELLOW}Environment Variables:${NC}"
    echo "  ENVIRONMENT=podman     - For local Podman development"
    echo "  ENVIRONMENT=openshift  - For connecting to OpenShift cluster"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  status                    - Show current cluster and user status"
    echo "  list-demo-users          - List all demo users"
    echo "  release <cluster_id>      - Release a specific cluster"
    echo "  release-all              - Release all clusters"
    echo "  reset-users              - Delete all workshop users"
    echo "  cleanup-all              - Complete database cleanup (DANGEROUS!)"
    echo "  add-cluster <name> <url> - Add a single cluster"
    echo "  add-demo-user <username> <password> - Add a global demo user"
    echo "  add-shared-cluster <name> <url> - Add a shared cluster"
    echo "  load-yaml <yaml_file>     - Load data from YAML file"
    echo "  help                     - Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ENVIRONMENT=podman $0 status"
    echo "  ENVIRONMENT=openshift $0 list-demo-users"
    echo "  ENVIRONMENT=podman $0 release 1"
    echo "  ENVIRONMENT=openshift $0 release-all"
    echo "  ENVIRONMENT=podman $0 cleanup-all"
    echo "  ENVIRONMENT=openshift $0 add-cluster cluster-6 https://cluster6.example.com"
    echo "  ENVIRONMENT=podman $0 add-demo-user added-user added-pass123"
    echo "  ENVIRONMENT=podman $0 add-shared-cluster shared-cluster https://shared.example.com"
    echo "  ENVIRONMENT=openshift $0 load-yaml db_init.example.yaml"
    echo ""
    echo -e "${YELLOW}Usage in different environments:${NC}"
    echo "  Local (Podman):     ENVIRONMENT=podman ./db-manage.sh status"
    echo "  OpenShift:          ENVIRONMENT=openshift ./db-manage.sh status"
}

# Main script logic
main() {
    setup_environment
    
    case "$1" in
    "status")
        show_status
        ;;
    "list-demo-users")
        list_demo_users
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
    "cleanup-all")
        cleanup_all
        ;;
    "add-cluster")
        add_cluster "$2" "$3"
        ;;
    "add-demo-user")
        add_demo_user "$2" "$3"
        ;;
    "add-shared-cluster")
        add_shared_cluster "$2" "$3"
        ;;
    "load-yaml")
        load_yaml "$2"
        ;;
    "help" | "")
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
    esac
}

# Run main function with all arguments
main "$@"