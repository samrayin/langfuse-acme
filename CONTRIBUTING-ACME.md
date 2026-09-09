# Contributing to this fork (ACME conventions)

This file governs ACME-specific changes to this Langfuse fork. For contributing to
Langfuse itself, see the upstream `CONTRIBUTING.md`.

## The one rule that matters

**Every ACME change is its own commit, and gets its own entry in
`ACME-CHANGELOG.md` in that same commit.** Never bundle an ACME customization into
an unrelated commit, and never let a change land without a changelog entry — that's
exactly how this fork started (one giant squashed commit with no record of what
changed or why), and it's what this convention exists to prevent going forward.

## Commit message shape

```
ACME: <short description>

<why this change exists — the reasoning, not just the what>
<any licensing/security consideration, if relevant>

See ACME-CHANGELOG.md for full detail.
```

Use `ACME branding:` / `ACME Enhancements:` / `ACME AI:` prefixes to match the
existing history when the change fits one of those areas; otherwise `ACME:` alone
is fine.

## Changelog entry shape

Each `ACME-CHANGELOG.md` entry should answer, in this order:
1. **What** changed (files touched).
2. **Why** this approach was chosen — especially if it's working around an
   Enterprise-licensed feature; cite the specific entitlement and where it's
   checked in source, don't assert from memory.
3. **Deployment status** — has this actually shipped to a running environment, or
   is it source-only?
4. Anything **known-incomplete** that needs attention before production.

## Before marking anything "done"

- If the change touches licensing-gated territory, verify against the actual
  source (`ee/` entitlement checks), not against docs or assumption — this fork's
  own history has already caught real docs/code mismatches more than once.
- If the change is meant to reach a live environment, it isn't done until it's
  actually in a built image and deployed — "committed" and "deployed" are
  different states, and `ACME-CHANGELOG.md` should say which one applies.

## Known gap in this fork's history

This repository's history starts from a snapshot of Langfuse v4.17.0 with ACME's
initial patches already applied as separate commits on top — it is **not** a real
clone of Langfuse's own upstream git history. This means:
- `git merge`/`git rebase` against a new upstream Langfuse release tag will not
  work cleanly. Upgrading the base Langfuse version means manually re-applying
  each ACME commit's changes on top of the new version, one at a time.
- If this fork becomes a long-term maintained artifact rather than a prototype,
  redoing it as a real `git clone` of `langfuse/langfuse` with these same patches
  replayed as commits on top (preserving proper upstream history) is worth the
  one-time cost.
