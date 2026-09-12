# IT Ops / Network Ops prompt library

**Status: content written and seed script built 2026-09-12, not yet seeded
against a live project.** Per [CONTRIBUTING-ACME.md](../../CONTRIBUTING-ACME.md#before-marking-anything-done),
this is "committed," not "deployed" -- nothing here is done until it's
actually been run against a real RAYIN project and the prompts show up in
that project's own Prompt Management page.

## What it is

Eight pre-built, real prompt templates for IT Ops and Network Ops use cases
(incident triage, change-risk assessment, RCA drafting, capacity planning,
ticket triage, backup/DR status, maintenance notices, config-change audit
summaries) -- see [`itops-netops-prompts.json`](itops-netops-prompts.json)
for the actual content. A small script
([`seed-itops-library.mjs`](seed-itops-library.mjs)) loads these into a
project via Langfuse's own public API (`POST /api/public/prompts`), so they
show up as ordinary versioned prompts in that project's existing Prompt
Management page -- not a new UI, not a new subsystem.

## Why this scope, and why not broader

Scoped deliberately to IT Ops and Network Ops, not a general-purpose
multi-department library (network diagnostics, backup/DR, change
management, capacity planning, ticket triage). Two reasons:

1. **This is ACME's own domain expertise.** ACME is an IT services company
   -- these prompts don't require acquiring knowledge ACME doesn't already
   have, the way a BFSI-compliance-specific library would. That makes the
   content actually trustworthy on day one, not a guess at what a bank
   needs.
2. **A prompt library that becomes RAYIN's headline feature dilutes the
   pitch** from "governed AI observability platform" to "generic prompt
   catalog." This stays a thin, opt-in starter layer riding on
   infrastructure already being built (LiteLLM gateway, guardrails), not a
   new product pillar.

## Why this doesn't need new infrastructure

Langfuse already has native Prompt Management -- versioning, labels,
experiments -- as a core, mature feature. Seeding it with real content is
not a new subsystem; every prompt created here is an ordinary Prompt row,
labeled `itops-library` and tagged the same way, visible and editable in the
existing Prompts page like any prompt a user creates by hand. Routing these
prompts through the LiteLLM gateway and rayin-guardrails (once that's wired,
see the guardrails/promptfoo work) drives real usage through the governed
path RAYIN is being sold on, rather than around it.

## Running it

```bash
cd integrations/prompt-library

LANGFUSE_HOST="https://langfuse-dev.aiatacme.com" \
LANGFUSE_PUBLIC_KEY="pk-lf-..." \
LANGFUSE_SECRET_KEY="sk-lf-..." \
node seed-itops-library.mjs
```

Needs a project-scoped Langfuse API key pair (Settings → API Keys in the
project you want these seeded into). Idempotent -- re-running adds a new
version of each prompt rather than erroring, so re-run after editing
`itops-netops-prompts.json` to push content updates.

## Verify

After running, open that project's **Prompt Management** page and confirm
the eight `itops/*`-named prompts appear, each labeled `itops-library` and
tagged the same way, with the content matching
[`itops-netops-prompts.json`](itops-netops-prompts.json).

## What this deliberately does NOT do

- **No new UI.** These are ordinary prompts in the existing Prompts page,
  filterable by the `itops-library` tag like any other tag -- no bespoke
  "prompt library" screen.
- **No enforcement of which model runs these prompts.** They're plain
  prompt content; whether a given deployment routes them through LiteLLM
  (recommended) or calls a provider directly is a separate, existing
  decision (see `integrations/litellm`), not something this script decides.
- **No BFSI-specific content.** A banking/compliance-flavored library is a
  plausible follow-on (see the positioning discussion this was scoped from)
  but is out of scope here -- different domain expertise, different
  maintenance burden, and deliberately not bundled with this so the two
  can be evaluated on their own merits.

## Status log

**2026-09-12 — content and seed script written, not yet run against a live
project.** Eight prompts drafted with real IT Ops/Network Ops content
(not placeholders), each structured as a system + user chat-message pair
with `{{variable}}` placeholders and an explicit "don't fabricate what the
input doesn't state" instruction baked into every prompt's system message.
Next: run the seed script against a real project and confirm the prompts
render correctly in Prompt Management.
