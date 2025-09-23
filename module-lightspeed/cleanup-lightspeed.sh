#!/usr/bin/env bash

set -euo pipefail

function delete_resources (){
  echo "Deleting all ${1} resources"
  # Check if the api-resource exists
  local crd=$(oc get crd "${1}" --no-headers --ignore-not-found)
  local api_resource=$(oc api-resources --no-headers | awk '{ print $1, $NF}' | grep -iw "${1}")
  if [ -n "${crd}${api_resource}" ]; then
    # Delete resources removing the finalizers and then remove it in a standard way and wait for 4m
    delete_finalizers_using_namespace "${1}"
    oc delete "${1}" --all -A --ignore-not-found --timeout=240s
  else
    echo "The server doesn't have a resource type ${1}"
  fi
}

function delete_finalizers_using_namespace (){
	echo "Deleting finalizers for all instances of $1 ..."
  oc get "$1" --all-namespaces -o custom-columns=:kind,:metadata.name,:metadata.namespace --ignore-not-found --no-headers=true | xargs -n 3 sh -c 'resource=$1;name=$2; namespace=$3; oc patch $resource $name --type=merge -p "{\"metadata\": {\"finalizers\":null}}" --namespace $namespace' sh || true
}

function delete_olm_resources() {
  local ns="${1}"
  local name="${2}"
  local csv="${3}"

  # Delete Subscriptions
  for sub in $(oc get sub -n "${ns}" -o json | jq -r --arg name "${name}" '.items[] | select(.metadata.name | test($name)) | .metadata.name'); do
    oc delete sub "${sub}" -n "${ns}"
  done

  # Delete Install Plans
  for ip in $(oc get ip -n "${ns}" -o json | jq -r --arg name "${csv}" '.items[] | select(.spec.clusterServiceVersionNames[]? | test($name)) | .metadata.name'); do
    oc delete ip "${ip}" -n "${ns}"
  done

  # Delete CSVs
  for csv in $(oc get csv -n "${ns}" -o json | jq -r --arg name "${csv}" '.items[] | select(.metadata.name | test($name)) | .metadata.name'); do
    oc delete csv "${csv}" -n "${ns}"
  done
}

function delete_marketplace_resources() {
  local name="${1}"
  local resources

  # Inspired by https://access.redhat.com/solutions/6459071
  resources=$(oc get job -n openshift-marketplace -o json | jq -r --arg name "${name}" '.items[] | select(.spec.template.spec.containers[].env // [] | .[].value | test($name)) | .metadata.name' | paste -sd ' ' -)
  if [[ -n "${resources}" ]]; then
    echo "Deleting markeplace jobs ${resources}"
    oc delete job -n openshift-marketplace ${resources}
    echo "Deleting marketplace configmaps ${resources}"
    oc delete configmap -n openshift-marketplace ${resources}
  else
    echo "No marketplace resources were found for '${name}'"
  fi
}

function delete_webhooks(){
  local name="${1}"
  local webhooks

  # Delete Validating Webhooks
  echo "Deleting validatingwebhookconfigurations for ${name}"
  webhooks=$(oc get validatingwebhookconfiguration -o json | jq -r --arg name "${name}" '.items[] | select(.metadata.name | test($name)) | .metadata.name')
  for webhook in ${webhooks}; do
    oc delete validatingwebhookconfiguration "${webhook}"
  done
  if [[ -z "${webhooks}" ]]; then
    echo "No webhooks found"
  fi
  # Delete Mutating Webhooks
  echo "Deleting mutatingwebhookconfigurations for ${name}"
  webhooks=$(oc get mutatingwebhookconfiguration -o json | jq -r --arg name "${name}" '.items[] | select(.metadata.name | test($name)) | .metadata.name')
  for webhook in ${webhooks}; do
    oc delete mutatingwebhookconfiguration "${webhook}"
  done
  if [[ -z "${webhooks}" ]]; then
    echo "No webhooks found"
  fi
}

function cleanup_openshift_pipelines() {
  oc delete -f ./install-pipelines-argocd-app.yaml --ignore-not-found

  delete_resources "tektonconfigs.operator.tekton.dev"
  delete_resources "tektoninstallersets.operator.tekton.dev" # Need to delete explicitly despite owned by TektonConfig
                                                             # Otherwise might get stuck on finalizers
  oc delete crd manualapprovalgates.operator.tekton.dev --ignore-not-found
  oc delete crd openshiftpipelinesascodes.operator.tekton.dev --ignore-not-found
  oc delete crd tektonaddons.operator.tekton.dev --ignore-not-found
  oc delete crd tektonchains.operator.tekton.dev --ignore-not-found
  oc delete crd tektonconfigs.operator.tekton.dev --ignore-not-found
  oc delete crd tektonhubs.operator.tekton.dev --ignore-not-found
  oc delete crd tektoninstallersets.operator.tekton.dev --ignore-not-found
  oc delete crd tektonpipelines.operator.tekton.dev --ignore-not-found
  oc delete crd tektonpruners.operator.tekton.dev --ignore-not-found
  oc delete crd tektonresults.operator.tekton.dev --ignore-not-found
  oc delete crd tektontriggers.operator.tekton.dev --ignore-not-found
  oc delete crd tektondashboards.operator.tekton.dev --ignore-not-found

  delete_marketplace_resources "pipelines-operator-bundle"
}

function cleanup_web_terminal() {
  oc delete -f ./install-web-terminal-argocd-app.yaml --ignore-not-found

  oc delete ns openshift-terminal --ignore-not-found

  delete_resources devworkspaceoperatorconfigs.controller.devfile.io
  delete_resources devworkspaceroutings.controller.devfile.io
  delete_resources devworkspaces.workspace.devfile.io
  delete_resources devworkspacetemplates.workspace.devfile.io

  delete_webhooks "controller.devfile.io"

  delete_olm_resources openshift-operators devworkspace-operator devworkspace-operator
  delete_olm_resources openshift-operators web-terminal web-terminal

  oc delete crd devworkspaceoperatorconfigs.controller.devfile.io --ignore-not-found
  oc delete crd devworkspaceroutings.controller.devfile.io --ignore-not-found
  oc delete crd devworkspaces.workspace.devfile.io --ignore-not-found
  oc delete crd devworkspacetemplates.workspace.devfile.io --ignore-not-found

  delete_marketplace_resources "web-terminal-operator-bundle"
  delete_marketplace_resources "devworkspace-operator-bundle"
}

oc delete -f ./lightspeed-applicationset.yaml --ignore-not-found
cleanup_openshift_pipelines
cleanup_web_terminal
