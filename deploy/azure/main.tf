# Root deployment config for ACME's Langfuse-on-Azure environment
# (rg-langfuse, swedencentral). Calls the ACME fork of the Langfuse Terraform
# module (../../infra/langfuse-terraform-azure) with the values that match
# the live environment.
#
# This file's only prior home was Azure Cloud Shell's $HOME, which lost its
# local storage twice in one session (2026-09-10) -- taking this file and
# Terraform's local state with it both times, while the real Azure resources
# were untouched. Committing it here, alongside the remote state backend in
# versions.tf, means neither can be lost to that again.
#
# State was NOT re-imported as of this commit -- `terraform plan` against
# this config will show it wanting to create everything from scratch until
# the ~65 live resources are reconciled into the new remote state via
# `import` blocks. Do not `apply` until that reconciliation is done and
# reviewed. See ACME-CHANGELOG.md for status.

module "langfuse" {
  source = "../../infra/langfuse-terraform-azure"

  domain   = "langfuse-dev.aiatacme.com"
  location = "swedencentral"
  name     = "langfuse"

  use_encryption_key = true

  virtual_network_address_prefix    = "10.224.0.0/12"
  aks_subnet_address_prefix         = "10.224.0.0/16"
  app_gateway_subnet_address_prefix = "10.225.0.0/16"
  db_subnet_address_prefix          = "10.226.0.0/24"
  redis_subnet_address_prefix       = "10.226.1.0/24"
  storage_subnet_address_prefix     = "10.226.2.0/24"

  kubernetes_version  = "1.32"
  aks_service_cidr    = "192.168.0.0/20"
  aks_dns_service_ip  = "192.168.0.10"
  node_pool_vm_size   = "Standard_D8s_v6"
  node_pool_min_count = 2
  node_pool_max_count = 10

  postgres_instance_count = 2
  postgres_ha_mode        = "SameZone"
  postgres_sku_name       = "GP_Standard_D2s_v3"
  postgres_storage_mb     = 32768

  redis_sku_name          = "Balanced_B3"
  redis_high_availability = true

  app_gateway_capacity = 1
  use_ddos_protection  = true

  langfuse_helm_chart_version = "2.0.0"

  # ACME's own images -- also the module's own defaults (see
  # infra/langfuse-terraform-azure/variables.tf), pinned explicitly here so
  # this file stays correct even if those defaults ever change upstream.
  web_image_repository    = "acmelangfuseacr.azurecr.io/langfuse-web"
  web_image_tag            = "acme-dev"
  worker_image_repository = "acmelangfuseacr.azurecr.io/langfuse-worker"
  worker_image_tag         = "acme-dev"

  # Redis Cluster compatibility fix (2026-09-10, during the v4.33.0 upgrade).
  # This Redis instance's clustering policy is Azure's "EnterpriseCluster"
  # (see `az redisenterprise show`, not the plain `OSSCluster` policy) --
  # keys ARE hash-slot-sharded (so BullMQ hit real CROSSSLOT errors), but
  # the OSS `CLUSTER SLOTS` topology-discovery command ioredis's native
  # Cluster client needs is blocked ("ERR command is not allowed"), so
  # Langfuse's own `REDIS_CLUSTER_ENABLED=true` path can't be used here --
  # it switches ioredis into Cluster-client mode, which depends on that
  # blocked command. Fix: stay on the simple single-node client
  # (REDIS_CLUSTER_ENABLED=false, Azure's own proxy handles routing) and
  # force every key the app touches onto one hash slot via a hash-tag-
  # wrapped REDIS_KEY_PREFIX -- collapses slot distribution, but on this
  # SKU (Balanced_B1, HA disabled) that's not a real performance cost, and
  # it's what actually eliminates CROSSSLOT without needing the blocked
  # command. Applied live via `kubectl set env` before this was captured
  # here; state isn't reconciled yet (see this file's header), so this
  # won't take effect via Terraform until that's done -- it's captured now
  # so a future `terraform apply` doesn't silently revert the live fix.
  additional_env = [
    {
      name  = "REDIS_CLUSTER_ENABLED"
      value = "false"
    },
    {
      name  = "REDIS_KEY_PREFIX"
      value = "{langfuse}"
    },
  ]
}
