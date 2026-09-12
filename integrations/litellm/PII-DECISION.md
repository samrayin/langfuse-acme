# Decision: PII redaction stays with `rayin-guardrails`, not LiteLLM's native guardrail

**Status: decided 2026-09-12. LiteLLM's native Presidio guardrail was built,
tested against nothing, and reverted — not adopted.**

## What was considered

A version of this integration briefly wired up LiteLLM's built-in
`guardrails:` config (the `presidio` guardrail, `mode: pre_call`), backed by
two separate standalone pods — `presidio-analyzer` and `presidio-anonymizer`
(`ghcr.io/data-privacy-stack/presidio-*:2.2.364`) — added to
`k8s/deployment.yaml` as `PRESIDIO_ANALYZER_API_BASE` /
`PRESIDIO_ANONYMIZER_API_BASE` env vars, config added to
`config/litellm-config.yaml`'s `guardrails:` block, manifests in
`k8s/presidio.yaml`.

That work is not lost — commit `02c8fabb9` has the exact config and manifest,
immediately reverted by `af0d1e7a2`, if it's ever worth reconsidering.

## Why it wasn't adopted

By the time this was built, [`rayin-guardrails`](https://github.com/samrayin/rayin-guardrails)
already existed, was deployed to this same `rayin-platform` namespace, and had
been proven live (PII redaction tested against a real request — email and
phone number both caught and masked). Running LiteLLM's native Presidio
guardrail alongside it would mean:

1. **Duplicated compute for identical capability** — Presidio's spaCy-model
   memory footprint (~512Mi–1.5Gi) paid for twice in the same cluster, once
   embedded in `rayin-guardrails`, once as two more standalone pods. Exactly
   the class of avoidable cost this deployment has otherwise been careful
   about (see the `bigpool` ACR agent pool removal and the AKS headroom
   analysis elsewhere in this project's history).
2. **Narrower coverage** — LiteLLM's native guardrail only protects traffic
   that actually flows *through* the LiteLLM proxy. `rayin-guardrails` is a
   general-purpose service any caller can hit directly (chat widget, agents,
   anything that doesn't go through the gateway at all) — the broader
   surface is the safer default while this platform is still small enough
   that "protect everything, one way" beats "protect the gateway path,
   another way."
3. **PII-only vs. PII + rail flows** — `rayin-guardrails` also handles
   jailbreak/topical detection via NeMo Guardrails in the same service.
   Adopting LiteLLM's native guardrail here would mean maintaining two
   separate PII systems while still needing `rayin-guardrails` for
   everything else — no actual simplification, just duplication.
4. **Unverified image source** — the `presidio-analyzer`/`presidio-anonymizer`
   images pinned here are a third-party fork (`ghcr.io/data-privacy-stack`),
   not Microsoft's own, and were never pulled or run before this decision.

## If this needs revisiting

The reverted config and manifest are one `git show` on the prior commit away.
Worth reconsidering only if `rayin-guardrails` itself needs to be retired, or
if there's a concrete reason to want defense-in-depth (two independent PII
checks) that outweighs the duplicated cost — neither is true today.
