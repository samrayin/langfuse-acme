# ACME Customization Changelog

This file catalogs every ACME-specific customization made to this Langfuse fork —
what changed, why, how it works, and its current status. It exists so this fork can
go to production with full context, not as a pile of undocumented patches.

**Convention going forward:** every ACME change lands as its own commit (never bundled
into an unrelated change), and gets an entry here in the same commit. See
`CONTRIBUTING-ACME.md` for the exact process.

**Base version:** Langfuse `v4.17.0`, Helm chart `2.0.2` — matches what's live on
`langfuse-dev.aiatacme.com` (see `Azure Blueprint/ENVIRONMENT-STUDY.md` in the
companion infrastructure project for the full deployment audit).

**Status of this fork as a whole:** **live on `langfuse-dev.aiatacme.com`** as of
2026-09-10. Both container images (`acmelangfuseacr.azurecr.io/langfuse-web:acme-dev`,
`acmelangfuseacr.azurecr.io/langfuse-worker:acme-dev`) are built, pushed, and
deployed — `kubectl get pods -n langfuse` shows both `1/1 Running`, 0 restarts. See
the "Live deployment" entry near the end of this file for the full path to get
there (including two real bugs found and fixed along the way — an ACR build OOM
and a CRLF-corrupted entrypoint script). Terraform itself does **not** yet manage
this deployment — see that same entry for why and what's needed to close that gap.

---

## 2026-09-09 — ACME branding (logo)

**What:** Replaced Langfuse's stock logo assets with ACME's own.

**Files:**
- `web/public/icon.svg`
- `web/public/wordart-black.svg`
- `web/public/wordart-white.svg`

**Why this approach, not Langfuse's paid UI-customization feature:** Langfuse's own
logo-replacement mechanism (`self-host-ui-customization` entitlement) requires an
Enterprise license *and* is co-branding only — the customer's logo sits alongside
Langfuse's, never replacing it (verified directly in `LangfuseLogo.tsx` during the
branding audit). Editing these three MIT-licensed static files directly achieves a
cleaner, full replacement than the paid feature does, at zero licensing cost. See the
branding audit (`AWS blueprint/langfuse-logo-branding-audit.md` in the companion
project) for the full legal reasoning — MIT permits this; only files under `ee/` would
require a license, and none of these three are.

**Deployment status:** Was briefly live on `langfuse-dev.aiatacme.com` via a manually
`kubectl`-applied ConfigMap + volume mount **outside Helm's own management** — a fragile
setup that a future `helm upgrade` would silently revert, since the chart's own
`extraVolumes`/`extraVolumeMounts` values (the correct, Helm-native mechanism) were
never actually set to `[]` → populated. That manual patch is not durable and is not
what's being version-controlled here. This commit instead bakes the files directly into
the fork's source tree, so they become part of any image built from this repo
permanently — no ConfigMap, no volume mount, no drift risk.

---

## 2026-09-09 — Contact ACME Support button

**What:** Added a "Contact ACME Support" button to the in-app Support panel, ahead of
the community GitHub links.

**File:** `web/src/features/support-chat/IntroSection.tsx`

**Why this approach:** Same reasoning as the logo — Langfuse's own `supportHref`
customization field exists for exactly this, but it's gated behind the same
Enterprise `self-host-ui-customization` entitlement (verified in
`uiCustomizationRouter.ts` — the whole customization object returns `null`
server-side without a valid license, regardless of what env vars are set). This button
is added directly to the MIT-licensed component instead, at zero licensing cost.

**Current target:** `mailto:anees.r@almoayyedcomputers.com` — a placeholder pointing at
a personal inbox. **Before production, this needs to become a real ACME support
channel** (a shared inbox or ticketing system), not an individual's email address.

**Deployment status:** Not yet deployed anywhere — source-only, same as everything
below.

---

## 2026-09-09 — ACME Enhancements: Audit Logs page

**What:** A new "ACME Enhancements" sidebar section with a license-free Audit Logs
viewer.

**Files:**
- `web/src/features/acme-enhancements/server/acmeAuditLogsRouter.ts`
- `web/src/features/acme-enhancements/components/AcmeAuditLogsTable.tsx`
- `web/src/features/acme-enhancements/pages/AcmeAuditLogsPage.tsx`
- `web/src/pages/project/[projectId]/acme-enhancements/audit-logs.tsx`
- `web/src/components/layouts/routes.tsx` (new nav entry + `RouteGroup.AcmeEnhancements`)
- `web/src/server/api/root.ts` (registers `acmeAuditLogs` router)

**Why this approach:** Verified during the original deployment audit that audit-log
*writes* are completely ungated in Langfuse OSS (`auditLog.ts` has no plan/entitlement
check) — only the official viewer UI is Enterprise-gated (`audit-logs` entitlement,
`auditLogs.ts:89,189`). That viewer component lives under `web/src/ee/`, which the root
`LICENSE` carves out as Enterprise-licensed regardless of what the code does at
runtime — so it can't be reused directly. This is a from-scratch reimplementation of
the same read query (same Prisma model, same pagination shape) in an MIT-licensed
location, using ordinary project RBAC (`auditLogs:read`) instead of the entitlement
check. No write path exists in this router — read-only by construction.

**Deployment status:** Not yet deployed.

---

## 2026-09-09 — ACME AI: in-app chat

**What:** A chat assistant embedded natively in the console (floating widget, bottom
right of every project-scoped page), grounded in the project's own trace data plus
ACME's operational knowledge.

**Files:**
- `web/src/features/acme-enhancements/server/acmeChatRouter.ts`
- `web/src/features/acme-enhancements/server/acmeKnowledgeBase.ts`
- `web/src/features/acme-enhancements/components/AcmeChatWidget.tsx`
- `web/src/components/layouts/app-layout/variants/AuthenticatedLayout.tsx` (widget wired
  into the global layout, `panel` layer band)
- `web/src/env.mjs` (new `ANTHROPIC_API_KEY` server-only env var)
- `web/package.json` (new `@anthropic-ai/sdk` dependency)
- `web/src/server/api/root.ts` (registers `acmeChat` router)

**Architecture, and why it's simpler than first assumed:** Originally scoped as
needing a separate backend service plus a Content-Security-Policy patch (to allow an
externally-loaded widget script). Neither turned out to be necessary once designed as
a *native* Next.js feature instead of an externally-embedded one:
- The chat backend runs server-side inside the already-authenticated tRPC process — no
  new service to deploy.
- CSP only restricts what the *browser* loads/calls; a same-origin tRPC mutation never
  triggers it. **No CSP change was needed at all.**
- Project data access reuses the same session-authenticated repository functions the
  rest of the app already uses (`getTracesTable`, `getTraceById`,
  `getObservationsForTrace`, `getScoresForTraces` from `@langfuse/shared/src/server`) —
  not a round-trip through Langfuse's own external MCP endpoint, which would have
  required solving a separate per-project API-key provisioning problem.

**Security design** (mirrors the standalone `acme_ai.py` reference tool built earlier
in this engagement — see that tool's own README for the fuller rationale):
1. **Read-only by construction** — the tool set (`list_recent_traces`,
   `get_trace_detail`) only ever calls read repository functions. No write tool is
   defined; Claude has no code path to mutate project data through this feature.
2. **Prompt-injection-safe tool results** — every tool result is wrapped in
   `<untrusted_data source="...">` tags before entering the conversation, with an
   explicit system-prompt instruction to treat that content as data, never as
   instructions, and to report (not comply with) anything inside those tags that looks
   like an injection attempt. Trace content originates from the project's own end
   users and must be treated as potentially adversarial.
3. **Project-scoped by the existing tRPC session** — a user can only ever query the
   project they're already authorized to view; no separate credential to provision or
   leak.

**Differentiator, not just parity:** Langfuse's own "Ask AI" (Cloud) is a docs
assistant with no access to a customer's actual data. This is grounded in the
project's real traces — something Langfuse's Enterprise tier doesn't offer at any
price. See `Azure Blueprint/ACME-Enterprise-Offering-Comparison.xlsx` (companion
project) for how this was priced into the offering.

**Known limitation:** the tool set is intentionally small (2 tools) for this first
version. Extending it to cover more of the read surface (scores, datasets, prompts)
follows the same pattern — add a function, add it to `TOOLS`, wire it in `runTool`.

**Deployment status:** Not yet deployed. Also not yet tested against a live Claude API
call end-to-end (the standalone reference tool hit an Anthropic account credit-balance
error during its own test; this in-app version has not been separately smoke-tested).

---

## 2026-09-09/10 — Build fix: strip `--platform` from Dockerfile FROM lines for ACR builds

**What:** Removed the `--platform=...` flag entirely from every `FROM` line in both
`web/Dockerfile` and `worker/Dockerfile` (7 stages each).

**Files:**
- `web/Dockerfile`
- `worker/Dockerfile`

**Why this approach:** Not an ACME feature — a build-tooling compatibility fix,
discovered and corrected across two `az acr build` attempts. Upstream Langfuse's
Dockerfiles pin every stage with `FROM --platform=${TARGETPLATFORM:-linux/amd64} ...`
(BuildKit's shell-style default-value substitution). Azure Container Registry
Tasks' pre-build "scan for dependencies" step uses a narrower Dockerfile parser
than real BuildKit and aborts the whole build before the build engine ever runs:
- Attempt 1 hardcoded the value (`--platform=linux/amd64`), assuming the `${VAR:-default}`
  substitution syntax specifically was the problem. Build still failed at the same
  step (`unable to understand line FROM --platform=linux/amd64 ...`,
  `failed to scan dependencies: exit status 1`) — ACR's scanner doesn't recognize the
  `--platform` flag on `FROM` at all, regardless of its value.
- Attempt 2 (this fix) removes the flag entirely. ACR build agents are themselves
  linux/amd64, and this fork's only deployment target is AKS on standard amd64 node
  pools, so omitting `--platform` (Docker then defaults to the build machine's own
  platform) is a correct, zero-risk fix for this deployment. It would need revisiting
  only if ACME ever needs to cross-build for a different architecture (e.g. ARM64
  nodes) — at which point per-arch builds via separate `az acr build --platform`
  invocations would be the right mechanism, not Dockerfile-level `TARGETPLATFORM`
  substitution (which ACR's scanner can't consume either way).

**Deployment status:** Source-only until the resulting images are actually built and
deployed — see build progress in this same session.

---

## 2026-09-10 — Build fix: regenerate lockfile, pin anthropic-ai/sdk to a mature version

**What:** Regenerated `pnpm-lock.yaml` (previously never updated after `@anthropic-ai/sdk`
was added to `web/package.json` during the ACME AI chat work) and changed the
dependency's version range from `^0.124.0` to `^0.123.0`.

**Files:**
- `pnpm-lock.yaml`
- `web/package.json`

**Why this approach:** Two separate real build failures, both discovered live
running `az acr build`, not assumed:
1. `pnpm install --frozen-lockfile` (what the Dockerfile runs) failed outright —
   `pnpm-lock.yaml` didn't match `web/package.json`'s `@anthropic-ai/sdk` addition.
   The lockfile was never regenerated when that dependency was added earlier in
   this engagement. Fixed by running `pnpm install --no-frozen-lockfile` to bring
   the lockfile back in sync.
2. That regeneration then hit this workspace's own `minimumReleaseAge: 7200`
   (5-day) supply-chain policy (`pnpm-workspace.yaml`) — `^0.124.0` resolves to
   `0.124.0`, published only days earlier, inside the maturity window. Rather than
   wait out the window or add a `minimumReleaseAgeExclude` bypass (a real security
   control this fork should not weaken), pinned to `^0.123.0` — the next version
   down, published 2026-09-01 and already clear of the window at the time of this
   fix.

**Deployment status:** Source-only until the resulting images are actually built and
deployed — see build progress in this same session.

---

## 2026-09-10 — Build note: web image OOM-killed on ACR's default build agent

**What:** No source change. Documenting a build-time-only workaround needed to get
`langfuse-web:acme-dev` built on Azure Container Registry's default (Basic-tier)
build agent: passing `--build-arg NEXT_IGNORE_BUILD_ERRORS=true` to `az acr build`.

**Why:** The first successful-past-dependency-resolution build attempt (run `dt4`)
compiled the Next.js app fine (`Compiled successfully in 3.3min`), then got killed
(`exit 137` — SIGKILL, the classic OOM-kill signature) during the separate
TypeScript type-checking pass that runs after compilation. ACR Tasks' default
build agent is memory-constrained, and this monorepo's full type-check is heavy
enough to exceed it. `web/Dockerfile` already had `NEXT_IGNORE_BUILD_ERRORS`
wired in for exactly this class of problem (its own comment: "Allows the CI
docker build smoke test to skip the Next.js type check that the lint job already
runs"). Two live attempts, not one:
- Attempt 1 passed `NEXT_IGNORE_BUILD_ERRORS=1`. Same OOM crash (run `dt5`) — the
  build still ran the full TypeScript check and died at the same point.
  `next.config.mjs` checks `process.env.NEXT_IGNORE_BUILD_ERRORS === "true"`, a
  strict string comparison; `"1"` never matched it, so the flag silently had no
  effect.
- Attempt 2 passed the literal string `NEXT_IGNORE_BUILD_ERRORS=true`. Build
  succeeded (run `dt6`, 15m31s) — confirms this Next.js version actually skips
  running the type-checker when the flag is honored, not just suppresses errors
  from it.

**Tradeoff, explicitly:** this means `langfuse-web:acme-dev` is NOT verified
type-clean by its own build — type errors would not fail this particular build.
Acceptable for a dev-prototype image; **not** acceptable for a real release build
without either (a) running on a build agent with more memory (e.g. a Premium-SKU
ACR dedicated agent pool), or (b) running `pnpm run typecheck` as a separate CI
step before building the image, which is exactly what Langfuse's own upstream CI
already does per that Dockerfile comment.

**Deployment status:** Applies only to how `langfuse-web:acme-dev` gets built,
not to any source file. See the "Custom image build" entry below for the
resulting image's actual status.

---

## 2026-09-10 — Custom image build: both images pushed to ACR

**What:** Both ACME-customized images successfully built (via `az acr build`,
Cloud Shell, driven end-to-end through browser automation) and pushed to the
`acmelangfuseacr` registry created for this purpose:

| Image | Tag | Digest | Build time |
|---|---|---|---|
| `langfuse-web` | `acme-dev` | `sha256:04aa360eb6a75f842e8a62837233e9f84b2b4331bf7460ce9d423c83531d56e7` | 15m31s (run `dt6`) |
| `langfuse-worker` | `acme-dev` | `sha256:31a417643c20a4e0393742176f5dbab83df56a798d26bd3d4050ceb3b1c68e47` | 8m19s (run `dt7`) |

Both built from this repo's `HEAD` at the time of the build (commit `fcc197f` and
earlier). The worker build hit one non-fatal issue worth noting: a native addon
(`cpu-features`, an optional transitive dependency, likely pulled in by an SSH
library) failed its `node-gyp` compile step (`Unable to detect compiler type` —
the minimal Alpine runtime stage has no C compiler) but did not abort the overall
install; the package degrades to a pure-JS fallback when its native build fails,
which is its documented behavior. No action needed.

**Why this matters:** This is the first point in the engagement where the ACME
fork exists as a runnable artifact, not just source. `web/Dockerfile` and
`worker/Dockerfile` changes (platform-flag fix, OOM workaround) and the
`pnpm-lock.yaml` regeneration (above) were all required to get here.

**Deployment status:** Images exist in ACR. **Not deployed** — `main.tf` in
Cloud Shell has not been updated to reference them yet, and no `terraform plan`
or `apply` has run. See "Outstanding, not yet done" below for the remaining
steps to actually reach `langfuse-dev.aiatacme.com`.

---

## 2026-09-10 — Terraform module fork: image override support

**What:** Vendored a patched copy of the upstream `langfuse/langfuse-terraform-azure`
module (pinned at tag `0.4.5`, matching what's live) into this repo at
`infra/langfuse-terraform-azure/`, adding four new optional variables
(`web_image_repository`, `web_image_tag`, `worker_image_repository`,
`worker_image_tag`) that pass through to the Helm release's `web.image`/
`worker.image` values — all `null` by default, so existing behavior is unchanged
unless explicitly set.

**Files:**
- `infra/langfuse-terraform-azure/variables.tf`
- `infra/langfuse-terraform-azure/langfuse.tf`
- `infra/langfuse-terraform-azure/ACME-FORK-README.md` (full rationale)

**Why this approach:** The underlying Helm chart (`2.0.2`, live) already supports
per-component image overrides; the Terraform module wrapper (`0.4.5`) simply never
exposed them as variables. This is the minimal additive patch needed to let
Terraform manage a custom ACME image instead of requiring an out-of-band `kubectl`
patch (the same drift risk already documented for the logo ConfigMap incident
above). See `ACME-FORK-README.md` for the full diff description.

**Deployment status:** Source-only. Not yet referenced by the live `main.tf` in
Cloud Shell, no `terraform plan`/`apply` run against it yet — deliberately held
back pending explicit review before touching the live cluster, per
`CONTRIBUTING-ACME.md`'s infra-change discipline.

---

## 2026-09-10 — Handoff: exact steps to deploy the built images

**Status:** Both images are built and in ACR (see "Custom image build" above).
`~/main.tf` in Cloud Shell already has a backup at `~/main.tf.bak-pre-acme-images`.
Editing `main.tf` and running `terraform apply` were deliberately left for manual
execution rather than done autonomously — this touches the live cluster and
deserves a human at the keyboard, not an overnight unattended change.

**Exact commands to run in Cloud Shell**, in order:

1. Point the module at this fork (replaces the pinned upstream commit ref):
   ```bash
   sed -i 's|source = "github.com/langfuse/langfuse-terraform-azure?ref=e939144c0a70dcc3de32f321ace86d34ee0d80c9"|source = "git::https://github.com/samrayin/langfuse-acme.git//infra/langfuse-terraform-azure?ref=main"|' ~/main.tf
   ```
2. Add the four new image-override arguments inside the existing `module "langfuse" { ... }` block in `~/main.tf` (anywhere inside the block, e.g. right after the `app_version = "4.17.0"` line):
   ```hcl
   web_image_repository    = "acmelangfuseacr.azurecr.io/langfuse-web"
   web_image_tag            = "acme-dev"
   worker_image_repository = "acmelangfuseacr.azurecr.io/langfuse-worker"
   worker_image_tag         = "acme-dev"
   ```
3. Re-initialize (the module source changed) and review the plan:
   ```bash
   cd ~ && terraform init -upgrade && terraform plan
   ```
4. Read the plan output carefully — it should show only the `helm_release.langfuse`
   resource changing (new `web.image`/`worker.image` values in its `values`), no
   resources being destroyed/recreated. If that looks right:
   ```bash
   terraform apply
   ```
5. After apply, verify the rollout:
   ```bash
   kubectl -n langfuse get pods -w
   kubectl -n langfuse get deployment langfuse-web -o jsonpath='{.spec.template.spec.containers[0].image}'
   kubectl -n langfuse get deployment langfuse-worker -o jsonpath='{.spec.template.spec.containers[0].image}'
   ```
   Then smoke-test `https://langfuse-dev.aiatacme.com` directly — logo, Contact
   Support button, ACME Enhancements → Audit Logs, and the ACME AI chat widget
   (needs `ANTHROPIC_API_KEY` — see the "Outstanding" section below, not yet set
   on the live deployment).

**If the plan shows anything unexpected** (resource replacement, unrelated
changes) — stop and investigate before applying. `main.tf.bak-pre-acme-images` is
there to revert from if needed.

---

## 2026-09-10 — Fix: Terraform module fork was built from the wrong base commit

**What:** Rebuilt `infra/langfuse-terraform-azure/` from the correct upstream
commit (`e939144c0a70dcc3de32f321ace86d34ee0d80c9` — the exact commit `main.tf`
actually pins) instead of tag `0.4.5`. Also made the `samrayin/langfuse-acme`
GitHub repo public, since Terraform's `git::https://` module source can't
authenticate to a private repo non-interactively and Cloud Shell has no stored
GitHub credentials for it.

**Why:** Live, caught by `terraform init` itself, not by review. The earlier
"Terraform module fork" entry above assumed tag `0.4.5` matched the pinned commit
SHA in `main.tf` without checking — it didn't. `0.4.5` is 10 commits behind the
actual pinned commit, and `terraform init` immediately failed with six
`Unsupported argument` errors (`clickhouse_replicas`,
`clickhouse_keeper_replicas`, `clickhouse_storage_size`,
`clickhouse_keeper_storage_size`, `redis_high_availability`, and the underlying
module having switched from `azurerm_redis_cache` to `azurerm_managed_redis`)
for variables the live config already sets, that don't exist in `0.4.5`.
Verified the correct commit with `git describe --tags <SHA>` against a full
clone of the upstream module before rebuilding, rather than guessing again.
The four-variable image-override patch itself was unaffected — reapplied
cleanly onto the correct base.

**Deployment status:** Fork corrected and pushed. Repo visibility change
(private → public) was the one part of this fix done by the user directly
(GitHub repo-settings changes are outside what runs autonomously) — everything
else (commit verification, file rebuild, patch reapplication, push) was done
end-to-end. Ready for `terraform init -upgrade` to be retried.

---

## 2026-09-10 — Live deployment: ACME fork now running on langfuse-dev.aiatacme.com

**What:** `langfuse-web:acme-dev` and `langfuse-worker:acme-dev` are deployed and
serving traffic. `kubectl get pods -n langfuse`:
```
langfuse-web-66454bcc86-h4jsw      1/1   Running   0   <fresh>
langfuse-worker-78f87875cf-vnhxw   1/1   Running   0   <fresh>
```
Zero downtime during the cutover — Kubernetes kept the previous pods serving until
each new one passed its readiness probe, standard rolling-update behavior.

**How this actually got deployed — not via Terraform:** Partway through, Cloud
Shell's persistent `$HOME` (where `main.tf` and Terraform's local state lived, per
the base-version note above) failed to mount on reconnect and came back completely
empty. The real Azure infrastructure was verified completely unaffected
(`az resource list -g rg-langfuse` — every resource `Succeeded`; `kubectl get pods`
— the then-current deployment healthy) — this was purely a Cloud Shell storage
issue, not data loss in the cluster. But with Terraform's own state gone, applying
through Terraform risked it trying to reconcile against a blank slate for
resources that already exist. Rather than block the deployment on a full
`terraform import` of ~30 resources, deployed directly via `helm upgrade
--reuse-values` (preserves every existing Helm value; only adds the four new image
keys) as a deliberate, temporary bridge. **Terraform does not manage this
deployment's current image configuration** — see "Outstanding" below.

**Two more real bugs found and fixed live, not assumed:**

1. **Wrong Helm value path.** Assumed (from earlier in this engagement, never
   re-verified) that the chart used top-level `web.image.repository`/
   `worker.image.repository`. It doesn't — confirmed via
   `helm show values langfuse-charts/langfuse --version 2.0.2`, the real path is
   `langfuse.web.image.repository` / `langfuse.worker.image.repository` (nested
   under the top-level `langfuse:` key). This was wrong in **both** the `helm
   upgrade --set` flags used here **and** the Terraform module fork's
   `image_values` local — the Terraform fork has since been corrected to match
   (not yet re-verified against a live `terraform plan`, since Terraform isn't
   managing this deployment right now — see "Outstanding").
2. **CRLF-corrupted `entrypoint.sh`.** Both new pods came up `ImagePullBackOff`
   first (separate issue: AKS's kubelet had no `AcrPull` role on the brand-new
   `acmelangfuseacr` registry — fixed with `az aks update --attach-acr
   acmelangfuseacr`, a standard grant, not destructive). Once pulling worked, both
   crashed with `[dumb-init] ./web/entrypoint.sh: No such file or directory` — a
   misleading error. Inspected the actual bytes inside the already-pushed image via
   a throwaway debug pod (`kubectl run --rm -it --command -- sh -c "cat -A
   ./web/entrypoint.sh"`) and found `#!/bin/sh^M$` — a CRLF-corrupted shebang, not a
   missing file. Root-caused to `git archive --format=zip` on Windows silently
   converting these files' line endings during archive creation, even though the
   actual git-stored blobs were already LF-only (confirmed: local checkout had no
   `\r`, the zip built from `git archive` did). Fixed with a `.gitattributes` rule
   (`*.sh text eol=lf`, `Dockerfile text eol=lf`) that forces `git archive` to emit
   LF regardless of platform — verified against a freshly regenerated zip before
   rebuilding. Both images were rebuilt and redeployed after this fix; the pods
   above are running the corrected images.

**Files:**
- `.gitattributes` (new rule)
- `infra/langfuse-terraform-azure/langfuse.tf`, `variables.tf` (corrected value path)

**Deployment status:** Live. Verify at `https://langfuse-dev.aiatacme.com` — ACME
logo, "Contact ACME Support" button, and "ACME Enhancements → Audit Logs" should
all be visible now. The ACME AI chat widget will appear but not respond yet (see
"Outstanding").

---

## Logo update: official ACME Almoayyed Computers Middle East logo

Replaced the earlier placeholder ACME mark with the official logo (pinwheel mark +
"ACME ALMOAYYED COMPUTERS MIDDLE EAST" wordmark with Arabic subtitle), sourced from
the exact file the user provided (`ACME Logo 01.svg`, an SVG shell wrapping a
237x76 JPEG — no manual redrawing, all derived pixels come from that source file).

**What changed:**
- `web/public/icon.svg` — square mark only, cropped from the source logo's left
  70x76 region (excludes the vertical divider line before the wordmark), padded
  onto a transparent 76x76 square, then resized to the existing 93x93 canvas.
- `web/public/wordart-black.svg` — full horizontal lockup (mark + wordmark), same
  pixels as the source file, format-converted from JPEG to PNG at native
  resolution (237x76). Used for the light-mode topbar logo.
- `web/public/favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`,
  `icon256.png`, `icon512.png`, `favicon.ico` — regenerated from the same square
  mark crop via standard bicubic resize (favicon.ico rebuilt as a proper
  multi-resolution 16/32/48 ICO with embedded PNG frames).

**Not changed — needs a decision:** `web/public/wordart-white.svg` (the dark-mode
topbar logo) was left as the previous placeholder. The source logo has an opaque
white background with dark text/mark, so using it as-is for dark mode would show a
white rectangle behind the logo instead of blending into the dark sidebar. Needs
either a proper light/transparent variant from ACME's brand assets, or a decision
to keep a plain wordmark-only treatment for dark mode.

**Files:**
- `web/public/icon.svg`, `wordart-black.svg`, `favicon-16x16.png`,
  `favicon-32x32.png`, `apple-touch-icon.png`, `icon256.png`, `icon512.png`,
  `favicon.ico`

**Deployment status:** Not yet built/deployed — needs a web image rebuild (same
ACR Tasks build + `helm upgrade` flow as the earlier logo/branding work) before
it's live on `langfuse-dev.aiatacme.com`.

---

## Outstanding, not yet done

- **Terraform doesn't manage the live image configuration.** The deployment above
  was done via direct `helm upgrade`, not `terraform apply`, because Cloud Shell's
  local Terraform state was unavailable at the time (see the "Live deployment"
  entry above). To close this gap: recover or rebuild Terraform state (either
  `terraform import` each of the ~30 resources in `rg-langfuse`, or — better,
  long-term — migrate to a remote backend, e.g. an Azure Storage blob container, so
  this can't recur), update `main.tf` per the module fork's `web_image_*`/
  `worker_image_*` variables (using the corrected `langfuse.web.image.*` /
  `langfuse.worker.image.*` paths, now fixed in the fork), and confirm
  `terraform plan` shows zero diff against what's actually running (it should,
  since the live Helm values already match what Terraform would set).
- **Cloud Shell storage mount reliability.** The `$HOME` mount failed at least
  twice in one session (once losing all local files, once again on a later
  reconnect). Worth a closer look at whether this is a one-off Azure-side hiccup
  or something about this specific storage account/file share
  (`csg10032006309a33d8` / `cs-anees-aiatacme-com-10032006309a33d8`,
  `cloud-shell-storage-centralindia`) that needs attention — not investigated
  further tonight since it wasn't blocking the deployment.
- **`ANTHROPIC_API_KEY` not set on the live deployment** — required for the ACME AI
  chat widget to actually respond; needs to be added as a Kubernetes secret and
  wired into the Helm values (same pattern as the other secrets in
  `kubernetes_secret.langfuse`), and eventually into Terraform once it manages this
  deployment again.
- **Contact button target** — placeholder personal email, needs a real support channel
  before production.
- **ACME AI end-to-end test** — backend/frontend built and internally consistent, not
  yet proven against a live Claude API call from inside the running app.
- **Full git history** — this repository's history starts from a single-commit
  snapshot of v4.17.0 plus all patches already applied, not a proper clone of
  Langfuse's own upstream history. Future upstream version bumps will need manual
  re-application of these patches (a `git merge` against upstream tags isn't available
  without redoing this as a real clone with these commits replayed on top).
