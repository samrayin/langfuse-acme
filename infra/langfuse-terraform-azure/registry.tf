# Optional, per-deployment Azure Container Registry. Off by default so
# existing deployments that manage their own registry separately (ACME's
# own live environment uses acmelangfuseacr, created out-of-band) are
# completely unaffected. RayIn customer deployments turn this on so each
# customer's AKS cluster pulls from a registry inside their own
# subscription -- never cross-tenant access into ACME's internal registry.
# See deploy/customer-template/README.md's "Registry strategy" section.
variable "create_container_registry" {
  description = "Whether to create a dedicated Azure Container Registry for this deployment and grant the AKS cluster pull access to it."
  type        = bool
  default     = false
}

resource "azurerm_container_registry" "this" {
  count               = var.create_container_registry ? 1 : 0
  name                = module.naming.container_registry.name_unique
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "Basic"
}

resource "azurerm_role_assignment" "aks_acr_pull" {
  count                = var.create_container_registry ? 1 : 0
  scope                = azurerm_container_registry.this[0].id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.this.kubelet_identity[0].object_id
}
