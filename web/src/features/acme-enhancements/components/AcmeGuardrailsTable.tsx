import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { api } from "@/src/utils/api";

const POLICIES = [
  {
    name: "PII Redaction",
    source: "Microsoft Presidio",
    status: "active" as const,
  },
  {
    name: "Jailbreak Detection",
    source: "NeMo Guardrails",
    status: "needs-llm-key" as const,
  },
  {
    name: "Topical Rail",
    source: "NeMo Guardrails",
    status: "needs-llm-key" as const,
  },
];

function PolicyStatusBadge({ status }: { status: (typeof POLICIES)[number]["status"] }) {
  if (status === "active") {
    return <Badge variant="success">Active</Badge>;
  }
  return <Badge variant="warning">Needs LLM key</Badge>;
}

function ActionBadge({ action }: { action: "allow" | "redact" | "block" }) {
  if (action === "block") return <Badge variant="error">Blocked</Badge>;
  if (action === "redact") return <Badge variant="warning">Redacted</Badge>;
  return <Badge variant="success">Allowed</Badge>;
}

export function AcmeGuardrailsTable({ projectId }: { projectId: string }) {
  const events = api.acmeGuardrails.recentEvents.useQuery(
    { projectId, limit: 50 },
    // Polling, not a subscription -- the source itself (rayin-guardrails'
    // in-memory buffer) has no push mechanism, so this is what "live" means
    // here.
    { refetchInterval: 10_000 },
  );

  if (events.isPending) {
    return <div className="text-muted-foreground p-4 text-sm">Loading…</div>;
  }

  if (events.isError) {
    return (
      <div className="text-muted-foreground p-4 text-sm">
        Could not reach rayin-guardrails: {events.error.message}
      </div>
    );
  }

  if (!events.data.configured) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">
          Guardrails isn&apos;t configured for this deployment.
          RAYIN_GUARDRAILS_URL is unset — this is expected for a deployment
          that hasn&apos;t opted into the rayin-guardrails integration.
        </CardContent>
      </Card>
    );
  }

  const { summary, events: recent } = events.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              In buffer
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">
            {summary.total}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Blocked
            </CardTitle>
          </CardHeader>
          <CardContent className="text-dark-red pt-0 text-2xl font-semibold">
            {summary.blocked}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Redacted
            </CardTitle>
          </CardHeader>
          <CardContent className="text-dark-yellow pt-0 text-2xl font-semibold">
            {summary.redacted}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Allowed
            </CardTitle>
          </CardHeader>
          <CardContent className="text-dark-green pt-0 text-2xl font-semibold">
            {summary.allowed}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Policies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {POLICIES.map((policy) => (
            <div
              key={policy.name}
              className="flex items-center justify-between border-b py-2 last:border-b-0"
            >
              <div>
                <div className="text-sm font-medium">{policy.name}</div>
                <div className="text-muted-foreground text-xs">{policy.source}</div>
              </div>
              <PolicyStatusBadge status={policy.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent events</CardTitle>
          <p className="text-muted-foreground text-xs">
            Held in rayin-guardrails&apos; own memory, most recent 200 —
            resets if that service restarts.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No events yet. Send a request through rayin-guardrails to see
              it here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((event, i) => (
                  <TableRow key={`${event.time}-${i}`}>
                    <TableCell className="font-mono text-xs">
                      {new Date(event.time).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>{event.agent_id}</TableCell>
                    <TableCell className="capitalize">{event.direction}</TableCell>
                    <TableCell>{event.policy_triggered ?? "—"}</TableCell>
                    <TableCell>
                      <ActionBadge action={event.action} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
