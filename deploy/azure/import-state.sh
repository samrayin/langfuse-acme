#!/usr/bin/env bash
# Reconciles the ~65 already-running Azure/AKS/Helm resources in rg-langfuse
# into this config's Terraform state via `terraform import` -- state-only,
# never touches the live resources themselves, never runs `apply`. See the
# "Reconcile ACME's live Azure resources into Terraform state" plan and
# ACME-CHANGELOG.md for the full rationale.
#
# Run this from the deploy/azure/ directory, in Cloud Shell (or anywhere
# with `az`, `kubectl`, and `terraform` already authenticated against this
# subscription/cluster), AFTER:
#   1. Both one-time role assignments have been granted (Storage Blob Data
#      Contributor on the state backend, Key Vault Secrets User on
#      kv-langfuse-bgqj) -- see ACME-CHANGELOG.md for the exact commands.
#   2. `terraform init` has been run successfully against this config.
#
# Safe to re-run: `terraform import` on an address already in state is a
# no-op error you can ignore, not a destructive action.
#
# Nothing sensitive is hardcoded below -- every secret value is looked up
# live (from Key Vault or the running Kubernetes secret) at the moment this
# runs, so the exact currently-deployed value is what gets imported, never
# a freshly generated one. Getting this wrong for the random_* resources
# specifically would risk a later `apply` rotating a secret the running
# app still depends on -- that's the one part of this script worth reading
# closely before trusting it.

set -euo pipefail

SUB_ID="87f4e6be-6585-4a1a-93f3-1a896cf644b9"
RG="rg-langfuse"
PREFIX="/subscriptions/${SUB_ID}/resourceGroups/${RG}/providers"

import() {
  local addr="$1" id="$2"
  echo "--- importing ${addr}"
  terraform import "${addr}" "${id}" || echo "    (skipped -- already in state, or genuinely failed; review above)"
}

echo "=== Resource group ==="
import module.langfuse.azurerm_resource_group.this \
  "/subscriptions/${SUB_ID}/resourceGroups/${RG}"

echo "=== Network ==="
import module.langfuse.azurerm_virtual_network.this \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse"
import module.langfuse.azurerm_public_ip.nat_gateway \
  "${PREFIX}/Microsoft.Network/publicIPAddresses/pip-langfuse-nat-gw"
import module.langfuse.azurerm_nat_gateway.this \
  "${PREFIX}/Microsoft.Network/natGateways/ng-langfuse"
import module.langfuse.azurerm_nat_gateway_public_ip_association.this \
  "${PREFIX}/Microsoft.Network/natGateways/ng-langfuse|${PREFIX}/Microsoft.Network/publicIPAddresses/pip-langfuse-nat-gw"

echo "=== Subnets ==="
import module.langfuse.azurerm_subnet.aks \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-aks"
import module.langfuse.azurerm_subnet.appgw \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-appgw"
import module.langfuse.azurerm_subnet.db \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfusedb"
import module.langfuse.azurerm_subnet.redis \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-redis"
import module.langfuse.azurerm_subnet.storage \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-storage"
import module.langfuse.azurerm_subnet_nat_gateway_association.aks \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-aks"
import module.langfuse.azurerm_subnet_nat_gateway_association.storage \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-storage"

echo "=== NSGs ==="
import module.langfuse.azurerm_network_security_group.aks \
  "${PREFIX}/Microsoft.Network/networkSecurityGroups/nsg-langfuse-aks"
import module.langfuse.azurerm_network_security_group.appgw \
  "${PREFIX}/Microsoft.Network/networkSecurityGroups/nsg-langfuse-appgw"
import module.langfuse.azurerm_subnet_network_security_group_association.aks \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-aks"
import module.langfuse.azurerm_subnet_network_security_group_association.appgw \
  "${PREFIX}/Microsoft.Network/virtualNetworks/vnet-langfuse/subnets/snet-langfuse-appgw"
for rule in AllowAppGwManagement AllowAzureLoadBalancer AllowHttpInbound AllowHttpsInbound; do
  case "$rule" in
    AllowAppGwManagement) addr=appgw_management ;;
    AllowAzureLoadBalancer) addr=appgw_loadbalancer ;;
    AllowHttpInbound) addr=http_inbound ;;
    AllowHttpsInbound) addr=https_inbound ;;
  esac
  import "module.langfuse.azurerm_network_security_rule.${addr}" \
    "${PREFIX}/Microsoft.Network/networkSecurityGroups/nsg-langfuse-appgw/securityRules/${rule}"
done

echo "=== Identities ==="
import module.langfuse.azurerm_user_assigned_identity.aks \
  "${PREFIX}/Microsoft.ManagedIdentity/userAssignedIdentities/uai-langfuse-aks"
import module.langfuse.azurerm_user_assigned_identity.appgw \
  "${PREFIX}/Microsoft.ManagedIdentity/userAssignedIdentities/uai-langfuse-appgw-identity"

echo "=== Role assignments (resolved by principal/role, not hardcoded GUIDs) ==="
AKS_UAI_PRINCIPAL=$(az identity show --ids "${PREFIX}/Microsoft.ManagedIdentity/userAssignedIdentities/uai-langfuse-aks" --query principalId -o tsv)
APPGW_UAI_PRINCIPAL=$(az identity show --ids "${PREFIX}/Microsoft.ManagedIdentity/userAssignedIdentities/uai-langfuse-appgw-identity" --query principalId -o tsv)
AKS_CLUSTER_ID="${PREFIX}/Microsoft.ContainerService/managedClusters/aks-langfuse"
KV_ID="${PREFIX}/Microsoft.KeyVault/vaults/kv-langfuse-bgqj"
RG_ID="/subscriptions/${SUB_ID}/resourceGroups/${RG}"

find_role_assignment_id() {
  local principal="$1" role="$2" scope="$3"
  az role assignment list --assignee "$principal" --role "$role" --scope "$scope" \
    --query "[0].id" -o tsv
}

RA=$(find_role_assignment_id "$AKS_UAI_PRINCIPAL" "Network Contributor" "$RG_ID")
[ -n "$RA" ] && import module.langfuse.azurerm_role_assignment.aks_network "$RA"

RA=$(find_role_assignment_id "$APPGW_UAI_PRINCIPAL" "Contributor" "$AKS_CLUSTER_ID")
[ -n "$RA" ] && import module.langfuse.azurerm_role_assignment.aks_agic_contributor "$RA"
RA=$(find_role_assignment_id "$APPGW_UAI_PRINCIPAL" "Reader" "$AKS_CLUSTER_ID")
[ -n "$RA" ] && import module.langfuse.azurerm_role_assignment.aks_agic_reader "$RA"
RA=$(find_role_assignment_id "$APPGW_UAI_PRINCIPAL" "Managed Identity Operator" "$AKS_CLUSTER_ID")
[ -n "$RA" ] && import module.langfuse.azurerm_role_assignment.agic_identity_operator "$RA"

echo "  NOTE: aks_agic_integration is the AGIC-addon-to-AppGW role and"
echo "  keyvault_secrets_user/keyvault_certificates_officer are KV-scoped --"
echo "  if any 'find_role_assignment_id' above returned empty, list them"
echo "  manually: az role assignment list --scope <resource-id> --all"
echo "  and add the matching 'terraform import module.langfuse.azurerm_role_assignment.<name> <id>'"
echo "  line by hand before continuing."

echo "=== Application Gateway ==="
import module.langfuse.azurerm_public_ip.appgw \
  "${PREFIX}/Microsoft.Network/publicIPAddresses/pip-langfuse-appgw"
import module.langfuse.azurerm_application_gateway.this \
  "${PREFIX}/Microsoft.Network/applicationGateways/agw-langfuse"

echo "=== AKS ==="
import module.langfuse.azurerm_kubernetes_cluster.this \
  "${AKS_CLUSTER_ID}"

echo "=== DNS ==="
import module.langfuse.azurerm_dns_zone.this \
  "${PREFIX}/Microsoft.Network/dnszones/langfuse-dev.aiatacme.com"
import module.langfuse.azurerm_dns_a_record.app_gateway \
  "${PREFIX}/Microsoft.Network/dnszones/langfuse-dev.aiatacme.com/A/@"

echo "=== Postgres ==="
import module.langfuse.azurerm_postgresql_flexible_server.this \
  "${PREFIX}/Microsoft.DBforPostgreSQL/flexibleServers/psql-langfuse-bgqj"
import module.langfuse.azurerm_postgresql_flexible_server_database.langfuse \
  "${PREFIX}/Microsoft.DBforPostgreSQL/flexibleServers/psql-langfuse-bgqj/databases/langfuse"
import module.langfuse.azurerm_private_endpoint.postgres \
  "${PREFIX}/Microsoft.Network/privateEndpoints/pe-langfuse-postgres"
import module.langfuse.azurerm_private_dns_zone.postgres \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.postgres.database.azure.com"
import module.langfuse.azurerm_private_dns_zone_virtual_network_link.postgres \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.postgres.database.azure.com/virtualNetworkLinks/langfuse-postgres"

echo "=== Redis ==="
import module.langfuse.azurerm_managed_redis.this \
  "${PREFIX}/Microsoft.Cache/redisEnterprise/redis-langfuse-bgqj"
import module.langfuse.azurerm_private_endpoint.redis \
  "${PREFIX}/Microsoft.Network/privateEndpoints/pe-langfuse-redis"
import module.langfuse.azurerm_private_dns_zone.redis \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.redis.azure.net"
import module.langfuse.azurerm_private_dns_zone_virtual_network_link.redis \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.redis.azure.net/virtualNetworkLinks/langfuse-redis"
REDIS_PE_IP=$(az network private-endpoint show --resource-group "$RG" --name pe-langfuse-redis --query "customDnsConfigs[0].ipAddresses[0]" -o tsv)
import module.langfuse.azurerm_private_dns_a_record.redis \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.redis.azure.net/A/redis-langfuse-bgqj"

echo "=== Storage ==="
import module.langfuse.azurerm_storage_account.this \
  "${PREFIX}/Microsoft.Storage/storageAccounts/stlangfusebgqj"
import module.langfuse.azurerm_storage_container.this \
  "https://stlangfusebgqj.blob.core.windows.net/stct-langfuse"
import module.langfuse.azurerm_private_endpoint.storage \
  "${PREFIX}/Microsoft.Network/privateEndpoints/pe-langfuse-storage"
import module.langfuse.azurerm_private_dns_zone.storage \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.blob.core.windows.net"
import module.langfuse.azurerm_private_dns_zone_virtual_network_link.storage \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.blob.core.windows.net/virtualNetworkLinks/langfuse-storage"
import module.langfuse.azurerm_private_dns_a_record.storage \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.blob.core.windows.net/A/stlangfusebgqj"

echo "=== Key Vault (needs the Key Vault Secrets User role granted first) ==="
import module.langfuse.azurerm_key_vault.this \
  "${PREFIX}/Microsoft.KeyVault/vaults/kv-langfuse-bgqj"
import module.langfuse.azurerm_private_endpoint.key_vault \
  "${PREFIX}/Microsoft.Network/privateEndpoints/pe-langfuse-keyvault"
import module.langfuse.azurerm_private_dns_zone.key_vault \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.vaultcore.azure.net"
import module.langfuse.azurerm_private_dns_zone_virtual_network_link.key_vault \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.vaultcore.azure.net/virtualNetworkLinks/langfuse-keyvault"
import module.langfuse.azurerm_private_dns_a_record.key_vault \
  "${PREFIX}/Microsoft.Network/privateDnsZones/privatelink.vaultcore.azure.net/A/kv-langfuse-bgqj"
KV_CERT_NAME=$(az keyvault certificate list --vault-name kv-langfuse-bgqj --query "[0].name" -o tsv)
if [ -n "$KV_CERT_NAME" ]; then
  KV_CERT_VERSION=$(az keyvault certificate show --vault-name kv-langfuse-bgqj --name "$KV_CERT_NAME" --query "id" -o tsv | awk -F/ '{print $NF}')
  import module.langfuse.azurerm_key_vault_certificate.this \
    "https://kv-langfuse-bgqj.vault.azure.net/certificates/${KV_CERT_NAME}/${KV_CERT_VERSION}"
else
  echo "  NOTE: no certificate found in kv-langfuse-bgqj -- skipped azurerm_key_vault_certificate.this, check manually"
fi
# random_string.key_vault_postfix: the naming module's random suffix is
# already visible in every resource name above ("bgqj") -- import by value,
# same mechanism as the random_password/random_bytes resources below.
import module.langfuse.random_string.key_vault_postfix "bgqj"

echo "=== Kubernetes / Helm ==="
import module.langfuse.kubernetes_namespace.langfuse "langfuse"
import module.langfuse.kubernetes_secret.langfuse "langfuse/langfuse"
import module.langfuse.helm_release.langfuse "langfuse/langfuse"
import module.langfuse.helm_release.cert_manager "cert-manager/cert-manager"
import module.langfuse.helm_release.clickhouse_operator "clickhouse-operator-system/clickhouse-operator"

echo "=== Sensitive: random_password / random_bytes (imported by their real live value) ==="
# Pulled from the running Kubernetes secret, never freshly generated --
# this is the part that must match what's actually deployed.
POSTGRES_PW=$(kubectl get secret -n langfuse langfuse -o jsonpath='{.data.postgres-password}' | base64 -d)
CLICKHOUSE_PW=$(kubectl get secret -n langfuse langfuse -o jsonpath='{.data.clickhouse-password}' | base64 -d)
SALT_B64=$(kubectl get secret -n langfuse langfuse -o jsonpath='{.data.salt}' | base64 -d)
NEXTAUTH_B64=$(kubectl get secret -n langfuse langfuse -o jsonpath='{.data.nextauth-secret}' | base64 -d)
ENCRYPTION_HEX=$(kubectl get secret -n langfuse langfuse -o jsonpath='{.data.encryption-key}' | base64 -d)

import module.langfuse.random_password.postgres_password "$POSTGRES_PW"
import module.langfuse.random_password.clickhouse_password "$CLICKHOUSE_PW"
# random_bytes imports by its base64 value directly (the .base64 attribute).
import module.langfuse.random_bytes.salt "$SALT_B64"
import module.langfuse.random_bytes.nextauth_secret "$NEXTAUTH_B64"
# random_bytes.encryption_key has count=1 (use_encryption_key=true) -- index it.
# The kubernetes_secret stores it hex-encoded; random_bytes imports by its
# base64 value, so re-derive that from the hex before importing.
ENCRYPTION_B64=$(echo -n "$ENCRYPTION_HEX" | xxd -r -p | base64 -w0)
import 'module.langfuse.random_bytes.encryption_key[0]' "$ENCRYPTION_B64"

echo ""
echo "=== Excluded on purpose ==="
echo "  time_sleep.key_vault_rbac_propagation -- no real-world identity,"
echo "  harmless to let Terraform recreate this one-time wait on next apply."

echo ""
echo "=== Done. Now run: terraform plan ==="
echo "It must show 0 to add, 0 to change, 0 to destroy (or every non-zero"
echo "line explained and accepted) before this is considered reconciled."
echo "Do NOT run 'terraform apply' until that plan is clean."
