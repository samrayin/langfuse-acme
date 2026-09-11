# Customer deployment template

This is a **template**, not a live deployment. It contains no real values —
copy the two `.example` files, fill them in for one specific customer, and
run Terraform from a copy of this folder (or this folder itself, with your
local copies of the filled-in files gitignored). It calls the same reusable
module as ACME's own deployment
([`../../infra/langfuse-terraform-azure`](../../infra/langfuse-terraform-azure))
with that customer's own values, producing a fully independent environment —
own network ranges, own resource names, own secrets, own Terraform state.
Nothing here can read, write, or collide with ACME's own environment or
another customer's.

## Why each customer needs their own state storage

Terraform's "state" is its own record of what it built — and it contains
every secret the deployment generates (database password, encryption keys)
in plain text. Recommended setup: **a small dedicated storage account in the
customer's own Azure subscription**, so a security incident on ACME's side
can never expose a customer's secrets, and vice versa. This mirrors exactly
how ACME's own state is set up (`rg-langfuse-tfstate` / `stacmelftfstate`,
see `../azure/versions.tf` and `../azure/README.md`).

## One-time setup, per customer

1. **Create the customer's state storage** (run once, against the
   customer's own subscription):

   ```bash
   az account set --subscription "<customer-subscription-id>"
   az group create --name rg-langfuse-tfstate --location <region>
   az storage account create \
     --name "st<customername>tfstate" \
     --resource-group rg-langfuse-tfstate \
     --location <region> \
     --sku Standard_LRS \
     --min-tls-version TLS1_2
   az storage account blob-service-properties update \
     --account-name "st<customername>tfstate" \
     --enable-versioning true \
     --enable-delete-retention true --delete-retention-days 30
   az storage container create \
     --account-name "st<customername>tfstate" \
     --name tfstate \
     --auth-mode login
   ```

2. **Grant yourself access to it** (same pattern as ACME's own backend):

   ```bash
   az role assignment create \
     --assignee "$(az ad signed-in-user show --query id -o tsv)" \
     --role "Storage Blob Data Contributor" \
     --scope "/subscriptions/<customer-subscription-id>/resourceGroups/rg-langfuse-tfstate/providers/Microsoft.Storage/storageAccounts/st<customername>tfstate"
   ```

3. **Copy and fill in the two example files** (both gitignored — never
   commit your filled-in copies):

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   cp backend.hcl.example <customername>.backend.hcl
   # edit both with this customer's real values
   ```

4. **Initialize, plan, review, apply:**

   ```bash
   terraform init -backend-config=<customername>.backend.hcl
   terraform plan
   # read the plan carefully -- it should show only resources being
   # created (this is a brand new environment), nothing being destroyed
   terraform apply
   ```

## Files

- `versions.tf` — provider requirements + a deliberately **empty** backend
  block (Terraform can't put variables in a backend block — real values
  come from `-backend-config` at init time, per customer)
- `providers.tf` — azurerm/kubernetes/helm provider configuration
- `main.tf` — the `module "langfuse"` call, every value from a variable
- `variables.tf` — every input, each with the module's own sensible
  default so a customer's `terraform.tfvars` only needs to override what's
  actually different for them
- `terraform.tfvars.example` → copy to `terraform.tfvars` (gitignored)
- `backend.hcl.example` → copy to `<customer>.backend.hcl` (gitignored)

## What's already handled for you

- **Resource naming never collides** between customers or with ACME's own
  deployment, even with the same `name` value — the module runs every
  resource name through `Azure/naming/azurerm`, which appends a random
  suffix.
- **Secrets are never copied between deployments.** The module generates a
  brand new random database password, NextAuth secret, and encryption key
  for every fresh deployment — there's nothing to remember to rotate or
  keep unique per customer.
- **The Redis Cluster compatibility fix** ACME hit in production
  (`REDIS_CLUSTER_ENABLED=false` + a hash-tag key prefix) is built into the
  module itself and applies automatically — not something this template or
  a customer's `terraform.tfvars` needs to set.
