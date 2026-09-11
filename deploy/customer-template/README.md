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

## Air-gapped / no-internet customer deployments

Everything in this deployment runs **inside the customer's own AKS cluster**
once it's up — Postgres, Redis, ClickHouse, and the Langfuse app itself all
have zero ongoing internet dependency after install. But getting there the
first time pulls several things from the public internet automatically,
none of which come from ACME's own private registry by default. For a truly
offline/air-gapped customer, all of the following need to be pre-mirrored
into a private registry the customer's network *can* reach, before the
first `terraform init`/`apply`:

1. **Terraform providers** (`terraform init`, before anything else runs) —
   `azurerm`, `kubernetes`, `helm`, `random`, `tls`, `time`, all from
   `registry.terraform.io/hashicorp/*` (exact versions/constraints in
   `versions.tf`).
2. **The `Azure/naming/azurerm` Terraform module** (also at `terraform init`) —
   from the public Terraform Registry, pinned to `0.4.2`
   (`../../infra/langfuse-terraform-azure/naming.tf`). Generates the
   randomized, collision-proof resource names every deployment uses.
3. **Three Helm charts** (`terraform apply`):
   - the Langfuse chart itself, from `https://langfuse.github.io/langfuse-k8s`
     (version set by `langfuse_helm_chart_version`)
   - `cert-manager`, from `https://charts.jetstack.io` (version set by
     `cert_manager_chart_version`) — issues internal certificates for the
     ClickHouse operator's webhooks
   - the ClickHouse Operator, from `oci://ghcr.io/clickhouse` (version set
     by `clickhouse_operator_chart_version`) — the tool that actually runs
     ClickHouse inside the cluster
4. **Every container image those three charts reference** — the ClickHouse
   database image itself, cert-manager's own running pods, the
   clickhouse-operator's own pod, plus the Langfuse web/worker images
   (already ACME's own images in `acmelangfuseacr` by this template's
   defaults — only the three items above and ClickHouse's own image are
   still pulled from public sources even with ACME's images set).

None of this is set up yet — Terraform and Helm both pull straight from the
public internet as of this template. Before handing this template to a
genuinely offline customer: mirror all of the above into a registry their
network can reach (Azure Container Registry supports `az acr import` for
container images and OCI Helm charts directly from a source registry; the
Terraform provider/module mirror needs a
[Terraform provider network mirror](https://developer.hashicorp.com/terraform/cli/config/config-file#provider-installation)
or a private Terraform Registry), then point `versions.tf`'s
`required_providers` and each `helm_release`'s `repository` at the mirrored
locations instead of the public ones.

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
