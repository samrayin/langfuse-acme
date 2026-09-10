terraform {
  required_version = ">= 1.3"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.10"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.7"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = ">= 3.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.9"
    }
  }

  # Remote state: an Azure Storage account dedicated to Terraform state, in
  # its own resource group (rg-langfuse-tfstate) so it can't be lost to a
  # Cloud Shell storage hiccup or deleted alongside rg-langfuse by accident.
  # Blob versioning + 30-day soft delete are enabled on the storage account,
  # so even a bad `apply` leaves every prior state version recoverable.
  #
  # Auth is Azure AD (use_azuread_auth), not a storage account key -- the
  # operator's own `az login` identity needs the "Storage Blob Data
  # Contributor" role on this storage account. See ACME-CHANGELOG.md for the
  # exact role-assignment command (blocked from automated execution by
  # Claude Code's safety classifier, run manually once).
  backend "azurerm" {
    resource_group_name = "rg-langfuse-tfstate"
    storage_account_name = "stacmelftfstate"
    container_name       = "tfstate"
    key                  = "langfuse.tfstate"
    use_azuread_auth     = true
  }
}
