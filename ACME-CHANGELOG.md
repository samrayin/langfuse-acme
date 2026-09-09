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

**Status of this fork as a whole:** dev prototype. None of the changes below have been
built into a deployed image yet — see "Deployment status" in each entry.

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

## 2026-09-09 — Build fix: ACR-compatible Dockerfile platform pins

**What:** Replaced `--platform=${TARGETPLATFORM:-linux/amd64}` (and one
`--platform=${BUILDPLATFORM}`) with a hardcoded `--platform=linux/amd64` on every
`FROM` line in both `web/Dockerfile` and `worker/Dockerfile`.

**Files:**
- `web/Dockerfile`
- `worker/Dockerfile`

**Why this approach:** Not an ACME feature — a build-tooling compatibility fix
discovered while running the first `az acr build` against this fork. Upstream
Langfuse's Dockerfiles use BuildKit's `${VAR:-default}` shell-style default
substitution in `--platform`, which real BuildKit (e.g. local `docker buildx build`)
handles fine, but Azure Container Registry Tasks' own pre-build "scan for
dependencies" step uses a narrower Dockerfile parser that cannot evaluate that
syntax and aborts the entire build (`unable to understand line FROM
--platform=${TARGETPLATFORM:-linux/amd64} ...`, `failed to scan dependencies: exit
status 1`) before the actual build engine ever runs. Since this fork's build target
is AKS on standard amd64 node pools, hardcoding `linux/amd64` is a correct,
zero-risk fix for this deployment — it only becomes a real limitation if ACME ever
needs to cross-build for a different architecture (e.g. ARM64 nodes), at which
point this would need revisiting (e.g. building per-arch via separate `az acr
build --platform` invocations instead of relying on Dockerfile-level `TARGETPLATFORM`
substitution).

**Deployment status:** Source-only until the resulting images are actually built and
deployed — see build progress in this same session.

---

## Outstanding, not yet done

- **Custom image build & deployment** — none of the above reaches
  `langfuse-dev.aiatacme.com` until built into a custom Docker image and deployed. The
  Terraform module (`langfuse-terraform-azure`) has no image-override variable today —
  forking it (adding an `image_repository`/`image_tag`-style passthrough) is required
  and not yet done.
- **Contact button target** — placeholder personal email, needs a real support channel
  before production.
- **ACME AI end-to-end test** — backend/frontend built and internally consistent, not
  yet proven against a live Claude API call from inside the running app.
- **Full git history** — this repository's history starts from a single-commit
  snapshot of v4.17.0 plus all patches already applied, not a proper clone of
  Langfuse's own upstream history. Future upstream version bumps will need manual
  re-application of these patches (a `git merge` against upstream tags isn't available
  without redoing this as a real clone with these commits replayed on top).
