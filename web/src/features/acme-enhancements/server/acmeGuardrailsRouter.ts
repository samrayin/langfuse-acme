/**
 * ACME enhancement — reads recent runtime-policy decisions and now also
 * reads/writes live policy config on rayin-guardrails
 * (https://github.com/samrayin/rayin-guardrails), a separate service, not
 * code in this repo.
 *
 * recentEvents/getConfig: "projectGuardrails:read" — any project member with
 * that scope, same sensitivity as Audit Logs (reveals what content was
 * flagged). rayin-guardrails' GET /v1/events is an in-memory ring buffer
 * (resets on that service's own pod restart, see its README "Known gaps") —
 * this dashboard is exactly as durable as that buffer, no more.
 *
 * updateConfig: "project:update" — owner/admin only, same gate as UI
 * Customization, since this changes what gets enforced for every user in
 * the project, not just how the dashboard looks. Writes are pushed live to
 * rayin-guardrails via its PUT /v1/config, authenticated with a shared
 * secret (RAYIN_GUARDRAILS_CONFIG_SECRET) — that endpoint is the one thing
 * on that service actually worth gating, since every other endpoint there
 * is read-only or self-contained.
 */
import { z } from "zod";
import { createTRPCRouter, protectedProjectProcedure } from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { env } from "@/src/env.mjs";

const ALL_PII_ENTITIES = [
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "CREDIT_CARD",
  "PERSON",
  "IBAN_CODE",
  "IP_ADDRESS",
] as const;

const ConfigResponseSchema = z.object({
  pii_entities: z.array(z.string()),
  jailbreak_enabled: z.boolean(),
  topical_enabled: z.boolean(),
  available_pii_entities: z.array(z.string()),
});

const GuardrailsEventSchema = z.object({
  time: z.string(),
  agent_id: z.string(),
  trace_id: z.string().nullable(),
  direction: z.enum(["input", "output"]),
  policy_triggered: z.string().nullable(),
  action: z.enum(["allow", "redact", "block"]),
});

const GuardrailsEventsResponseSchema = z.object({
  events: z.array(GuardrailsEventSchema),
  summary: z.object({
    total: z.number(),
    blocked: z.number(),
    redacted: z.number(),
    allowed: z.number(),
  }),
});

export const acmeGuardrailsRouter = createTRPCRouter({
  recentEvents: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectGuardrails:read",
      });

      if (!env.RAYIN_GUARDRAILS_URL) {
        return { configured: false as const };
      }

      const res = await fetch(
        `${env.RAYIN_GUARDRAILS_URL}/v1/events?limit=${input.limit}`,
        // Same network boundary as litellm — in-cluster only, no auth on
        // this endpoint yet (see rayin-guardrails README "Known gaps").
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) {
        throw new Error(
          `rayin-guardrails returned ${res.status} fetching /v1/events`,
        );
      }

      const parsed = GuardrailsEventsResponseSchema.parse(await res.json());
      return { configured: true as const, ...parsed };
    }),

  getConfig: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectGuardrails:read",
      });

      if (!env.RAYIN_GUARDRAILS_URL) {
        return { configured: false as const };
      }

      const res = await fetch(`${env.RAYIN_GUARDRAILS_URL}/v1/config`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        throw new Error(`rayin-guardrails returned ${res.status} fetching /v1/config`);
      }

      const parsed = ConfigResponseSchema.parse(await res.json());
      return { configured: true as const, ...parsed };
    }),

  updateConfig: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        piiEntities: z.array(z.enum(ALL_PII_ENTITIES)).optional(),
        jailbreakEnabled: z.boolean().optional(),
        topicalEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Deliberately project:update, not projectGuardrails:read -- this
      // changes enforcement for every user in the project, the same bar
      // UI Customization's write path uses, not just a read permission.
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });

      if (!env.RAYIN_GUARDRAILS_URL) {
        throw new Error(
          "RAYIN_GUARDRAILS_URL is not configured for this deployment — nothing to push this change to.",
        );
      }
      if (!env.RAYIN_GUARDRAILS_CONFIG_SECRET) {
        throw new Error(
          "RAYIN_GUARDRAILS_CONFIG_SECRET is not configured — refusing to call an endpoint we can't authenticate to.",
        );
      }

      const res = await fetch(`${env.RAYIN_GUARDRAILS_URL}/v1/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Config-Secret": env.RAYIN_GUARDRAILS_CONFIG_SECRET,
        },
        body: JSON.stringify({
          pii_entities: input.piiEntities,
          jailbreak_enabled: input.jailbreakEnabled,
          topical_enabled: input.topicalEnabled,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`rayin-guardrails rejected the config update (${res.status}): ${detail}`);
      }

      const parsed = ConfigResponseSchema.parse(await res.json());
      return parsed;
    }),
});
