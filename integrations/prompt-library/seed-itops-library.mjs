#!/usr/bin/env node
// Seeds the IT Ops / Network Ops starter prompt library into a RAYIN project
// via Langfuse's own public API (POST /api/public/prompts) -- not a DB
// script, so this runs against any live deployment (local, staging, a
// customer's own tenant) the same way, with no monorepo path-alias
// coupling to web/'s internals.
//
// Usage:
//   LANGFUSE_HOST=https://langfuse-dev.aiatacme.com \
//   LANGFUSE_PUBLIC_KEY=pk-lf-... \
//   LANGFUSE_SECRET_KEY=sk-lf-... \
//   node seed-itops-library.mjs
//
// Idempotent: POST /api/public/prompts creates a new VERSION of a prompt
// with the same name rather than erroring, so re-running this is safe --
// it just adds a new (identical) version each time. Re-running after
// editing itops-netops-prompts.json is the intended way to update the
// library's content.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOST = process.env.LANGFUSE_HOST;
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

if (!HOST || !PUBLIC_KEY || !SECRET_KEY) {
  console.error(
    "Missing required env vars: LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY",
  );
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64");

const __dirname = dirname(fileURLToPath(import.meta.url));
const prompts = JSON.parse(
  readFileSync(join(__dirname, "itops-netops-prompts.json"), "utf8"),
);

async function createPrompt(entry) {
  const res = await fetch(`${HOST}/api/public/prompts`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: entry.name,
      prompt: entry.prompt,
      type: "chat",
      isActive: true,
      labels: [entry.label],
      tags: ["itops-library"],
      commitMessage: entry.description,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${entry.name}: ${res.status} ${detail}`);
  }

  const body = await res.json();
  return { name: entry.name, version: body.version };
}

async function main() {
  console.log(`Seeding ${prompts.length} IT Ops / Network Ops prompts to ${HOST}...`);
  let ok = 0;
  let failed = 0;

  for (const entry of prompts) {
    try {
      const result = await createPrompt(entry);
      console.log(`  ✓ ${result.name} (v${result.version})`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${entry.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} created, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
