output "cluster_name" {
  description = "The name of the AKS cluster"
  value       = azurerm_kubernetes_cluster.this.name
}

output "cluster_host" {
  description = "The host of the AKS cluster"
  value       = azurerm_kubernetes_cluster.this.kube_config[0].host
  sensitive   = true
}

output "cluster_client_certificate" {
  description = "The client certificate for the AKS cluster"
  value       = azurerm_kubernetes_cluster.this.kube_config[0].client_certificate
  sensitive   = true
}

output "cluster_client_key" {
  description = "The client key for the AKS cluster"
  value       = azurerm_kubernetes_cluster.this.kube_config[0].client_key
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "The CA certificate for the AKS cluster"
  value       = azurerm_kubernetes_cluster.this.kube_config[0].cluster_ca_certificate
  sensitive   = true
}

output "dns_name_servers" {
  description = "Name servers of the DNS zone, for the delegation step"
  value       = azurerm_dns_zone.this.name_servers
}

output "container_registry_login_server" {
  description = "Login server of this deployment's dedicated container registry (null unless create_container_registry is true). Mirror the branded RayIn images here with `az acr import` before pointing web_image_repository/worker_image_repository at it -- see deploy/customer-template/README.md's 'Registry strategy' section."
  value       = var.create_container_registry ? azurerm_container_registry.this[0].login_server : null
}
