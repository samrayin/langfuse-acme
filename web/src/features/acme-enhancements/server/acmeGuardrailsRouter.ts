/**
 * ACME enhancement — reads recent runtime-policy decisions (block / redact /
 * allow) from rayin-guardrails (https://github.com/samrayin/rayin-guardrails),
 * a separate service, not code in this repo.
 *
 * This router only ever reads. rayin-guardrails' GET /v1/events is itself an
 * in-memory ring buffer (last 200 decisions, resets on that service's own pod
 * restart) — see that repo's README "Known gaps". This dashboard is exactly
 * as durable as that buffer, no more; a real events table is future work on
 * the guardrails side, not something this router works around.
 *
 * RBAC: "projectGuardrails:read", owner/admin only — same sensitivity level
 * as Audit Logs, since these events reveal what content was flagged.
 */
import { z } from "zod";
import { createTRPCRouter, protectedProjectProcedure } from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { env } from "@/src/env.mjs";

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
});
