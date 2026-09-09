# ACME fork of `langfuse/langfuse-terraform-azure`

This directory is a patched copy of the upstream Terraform module
[`langfuse/langfuse-terraform-azure`](https://github.com/langfuse/langfuse-terraform-azure),
pinned at tag `0.4.5` — the exact version currently used to manage
`langfuse-dev.aiatacme.com` (see `Azure Blueprint/Azure.md` §2 in the companion
infrastructure project).

## Why this fork exists

The underlying Langfuse Helm chart (deployed at version `2.0.2`) already supports
per-component container image overrides (`web.image.repository`/`tag`,
`worker.image.repository`/`tag`) — this was verified directly against the chart's
`values.yaml` during the branding/deployment audit. But this Terraform module's
`0.4.5` release does not expose those as module variables anywhere in its
`helm_release.langfuse` values composition (`langfuse.tf`) — there was no
passthrough for a custom image at all. Without this, there is no way to point the
Terraform-managed deployment at the custom ACME image (built from
`langfuse-acme`, this repo's own web/worker fork) without hand-editing generated
Helm values outside Terraform's management — exactly the kind of drift risk this
whole engagement has been working to avoid (see the branding ConfigMap incident in
`ACME-CHANGELOG.md`).

## What changed vs. upstream `0.4.5`

- `variables.tf` — added four new optional variables, all defaulting to `null`
  (meaning: fall back to the chart's own default image, i.e. upstream Langfuse):
  - `web_image_repository`, `web_image_tag`
  - `worker_image_repository`, `worker_image_tag`
- `langfuse.tf` — added a new `local.image_values` Helm values block, populated
  only when at least one of the four variables above is set, and appended to
  `helm_release.langfuse`'s `values` list. Follows the exact same conditional
  heredoc pattern already used by this file's `encryption_values` and
  `additional_env_values` locals — no new pattern introduced.

No other files were touched. This is a minimal, additive patch: every existing
module consumer's behavior is unchanged unless they explicitly set one of the new
variables.

## Usage

```hcl
module "langfuse" {
  source = "./infra/langfuse-terraform-azure"  # or wherever this is vendored from

  # ... existing required variables (domain, etc.) ...

  web_image_repository    = "acmelangfuseacr.azurecr.io/langfuse-web"
  web_image_tag            = "acme-dev"
  worker_image_repository = "acmelangfuseacr.azurecr.io/langfuse-worker"
  worker_image_tag         = "acme-dev"
}
```

## Deployment status

Source-only — not yet referenced by the live `main.tf` in Cloud Shell, and no
`terraform plan`/`apply` has been run against it yet. See `ACME-CHANGELOG.md` at
the repo root for the up-to-date status of this and every other ACME change.

## Known gap, same as the app fork

This is a patched snapshot, not a live-tracked fork with upstream history
preserved (same tradeoff documented in `CONTRIBUTING-ACME.md` for the app side).
Upgrading past `0.4.5` means manually re-applying this same four-variable patch
to the new version.
