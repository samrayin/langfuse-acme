// promptfoo afterEach hook — attaches promptfoo assertion verdicts to the
// Langfuse trace that the same eval row produced via OTLP (see Phase 6a in
// ../../README.md).
//
// Requires: LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY.
// Scores may be posted before the trace lands; Langfuse back-fills the link.
//
// The cluster's TLS is a real Let's Encrypt certificate (cert-manager), not
// self-signed — this file never needs NODE_TLS_REJECT_UNAUTHORIZED or -k,
// and must not gain them later just because a run fails for some other
// reason.

const HOST = process.env.LANGFUSE_HOST;
const AUTH =
  "Basic " +
  Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`,
  ).toString("base64");

async function postScore(body) {
  const res = await fetch(`${HOST}/api/public/scores`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Never fail the eval because telemetry failed.
    console.warn(`[langfuse-scores] ${res.status}: ${await res.text()}`);
  }
}

async function langfuseScores(hookName, context) {
  if (hookName !== "afterEach") return;

  const { result } = context;
  const traceId = result?.traceId;
  if (!traceId) {
    console.warn("[langfuse-scores] no traceId on result — is PROMPTFOO_OTEL_ENABLED set?");
    return;
  }

  const evalId = result?.metadata?.evaluationId ?? "adhoc";

  // 1. Overall pass/fail for the row.
  await postScore({
    traceId,
    name: "promptfoo-pass",
    value: result.success ? 1 : 0,
    dataType: "BOOLEAN",
    comment: `promptfoo eval ${evalId}`,
  });

  // 2. Aggregate numeric score.
  if (typeof result.score === "number") {
    await postScore({
      traceId,
      name: "promptfoo-score",
      value: result.score,
      dataType: "NUMERIC",
      comment: `promptfoo eval ${evalId}`,
    });
  }

  // 3. Each named assertion metric as its own score.
  for (const [name, value] of Object.entries(result.namedScores ?? {})) {
    if (typeof value !== "number") continue;
    await postScore({
      traceId,
      name: `promptfoo-${name}`,
      value,
      dataType: "NUMERIC",
      comment: `promptfoo eval ${evalId}`,
    });
  }

  return context;
}

module.exports = langfuseScores;
