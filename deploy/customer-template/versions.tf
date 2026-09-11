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

  # Deliberately partial: a Terraform backend block cannot reference
  # variables, so the real values (this customer's own state storage
  # account, in their own subscription) are supplied at `terraform init`
  # time via `-backend-config=<customer>.backend.hcl` -- see
  # backend.hcl.example and README.md. This keeps every customer's state
  # location a per-customer secret, never a value baked into this repo.
  backend "azurerm" {
    use_azuread_auth = true
  }
}
