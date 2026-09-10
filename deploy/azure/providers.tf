provider "azurerm" {
  subscription_id = "87f4e6be-6585-4a1a-93f3-1a896cf644b9" # MS_Sponsorship_ADS_Audit
  features {}
}

provider "kubernetes" {
  host                   = module.langfuse.cluster_host
  client_certificate     = base64decode(module.langfuse.cluster_client_certificate)
  client_key             = base64decode(module.langfuse.cluster_client_key)
  cluster_ca_certificate = base64decode(module.langfuse.cluster_ca_certificate)
}

provider "helm" {
  kubernetes = {
    host                   = module.langfuse.cluster_host
    client_certificate     = base64decode(module.langfuse.cluster_client_certificate)
    client_key             = base64decode(module.langfuse.cluster_client_key)
    cluster_ca_certificate = base64decode(module.langfuse.cluster_ca_certificate)
  }
}
