# ACME Langfuse — root deployment config

This is the **root** Terraform configuration for ACME's live Langfuse-on-Azure
environment (`rg-langfuse`, swedencentral). It calls the reusable module
vendored at [`../../infra/langfuse-terraform-azure`](../../infra/langfuse-terraform-azure)
with the values that match what's actually running.

Until 2026-09-10 this file only ever existed in Azure Cloud Shell's `$HOME`,
which lost its local storage twice in one session — taking this file and
Terraform's local state with it both times (the real Azure resources were
untouched; only Terraform's own memory of them was lost). It's committed here
now specifically so that can't happen again.

## One-time setup still required

State is remote (see `versions.tf`'s `backend "azurerm"` block — an Azure
Storage account in its own resource group, `rg-langfuse-tfstate`, with blob
versioning and 30-day soft delete), authenticated via Azure AD rather than a
storage account key. Each operator needs the **Storage Blob Data Contributor**
role on that storage account before `terraform init` will work:

```bash
az role assignment create \
  --assignee "<your-az-ad-object-id>" \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/87f4e6be-6585-4a1a-93f3-1a896cf644b9/resourceGroups/rg-langfuse-tfstate/providers/Microsoft.Storage/storageAccounts/stacmelftfstate"
```

(Get your object ID with `az ad signed-in-user show --query id -o tsv`.)

## Status: state not yet reconciled

This config is **not yet safe to `apply`**. The remote backend is live and
empty — `terraform plan` right now will want to create all ~65 resources from
scratch, which would collide with the real, already-running environment.
Before any `apply`:

1. Run `terraform init` (safe — only connects to the backend, touches nothing)
2. Reconcile the live resources into this state via `import` blocks (in
   progress — see the "Outstanding" section of `ACME-CHANGELOG.md`)
3. Confirm `terraform plan` shows **zero** changes before trusting `apply`

## Files

- `versions.tf` — provider requirements + the remote state backend
- `providers.tf` — azurerm/kubernetes/helm provider configuration
- `main.tf` — the actual `module "langfuse"` call, pinned to live values
