import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Switch } from "@/src/components/ui/switch";
import { Button } from "@/src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { cn } from "@/src/utils/tailwind";

const ALL_PII_ENTITIES = [
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "CREDIT_CARD",
  "PERSON",
  "IBAN_CODE",
  "IP_ADDRESS",
] as const;
type PiiEntity = (typeof ALL_PII_ENTITIES)[number];

const ENTITY_LABELS: Record<string, string> = {
  EMAIL_ADDRESS: "Email",
  PHONE_NUMBER: "Phone",
  CREDIT_CARD: "Credit card",
  PERSON: "Person names",
  IBAN_CODE: "IBAN",
  IP_ADDRESS: "IP address",
};

function ActionBadge({ action }: { action: "allow" | "redact" | "block" }) {
  if (action === "block") return <Badge variant="error">Blocked</Badge>;
  if (action === "redact") return <Badge variant="warning">Redacted</Badge>;
  return <Badge variant="success">Allowed</Badge>;
}

function AcmeGuardrailsPolicies({ projectId }: { projectId: string }) {
  const canEdit = useHasProjectAccess({ projectId, scope: "project:update" });
  const utils = api.useUtils();
  const config = api.acmeGuardrails.getConfig.useQuery({ projectId });

  // Draft state: what the switches show while editing, versus what's
  // actually saved (config.data). Only diverges after a real edit.
  const [draft, setDraft] = useState<{
    piiEntities: string[];
    jailbreakEnabled: boolean;
    topicalEnabled: boolean;
  } | null>(null);

  useEffect(() => {
    if (config.data?.configured) {
      setDraft({
        piiEntities: config.data.pii_entities,
        jailbreakEnabled: config.data.jailbreak_enabled,
        topicalEnabled: config.data.topical_enabled,
      });
    }
  }, [config.data]);

  const update = api.acmeGuardrails.updateConfig.useMutation({
    onSuccess: (data) => {
      utils.acmeGuardrails.getConfig.invalidate({ projectId });
      setDraft({
        piiEntities: data.pii_entities,
        jailbreakEnabled: data.jailbreak_enabled,
        topicalEnabled: data.topical_enabled,
      });
      showSuccessToast({
        title: "Guardrails updated",
        description: "Saved and pushed to rayin-guardrails — effective on the next request.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to update guardrails", error.message);
    },
  });

  if (config.isPending || !draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Policies</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground pt-0 text-sm">Loading…</CardContent>
      </Card>
    );
  }

  if (config.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Policies</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground pt-0 text-sm">
          Could not reach rayin-guardrails: {config.error.message}
        </CardContent>
      </Card>
    );
  }

  if (!config.data.configured) {
    return null; // Parent already shows the "not configured" state.
  }

  const saved = config.data;
  const isDirty =
    draft.jailbreakEnabled !== saved.jailbreak_enabled ||
    draft.topicalEnabled !== saved.topical_enabled ||
    draft.piiEntities.length !== saved.pii_entities.length ||
    draft.piiEntities.some((e) => !saved.pii_entities.includes(e));

  const piiOn = draft.piiEntities.length > 0;

  function toggleEntity(entity: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      piiEntities: draft.piiEntities.includes(entity)
        ? draft.piiEntities.filter((e) => e !== entity)
        : [...draft.piiEntities, entity],
    });
  }

  function togglePiiMaster(on: boolean) {
    if (!draft) return;
    // Off -> empty list (the master switch); on -> restore every entity
    // this deployment can detect, not just the ones that happened to be
    // saved before — a reasonable default for "turn it back on."
    setDraft({
      ...draft,
      piiEntities: on ? saved.available_pii_entities : [],
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Policies</CardTitle>
        {!canEdit && (
          <span className="text-muted-foreground text-xs">Owner/Admin can edit</span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        <div className="flex items-start justify-between gap-3 border-b py-3">
          <div>
            <div className="text-sm font-medium">Jailbreak Detection</div>
            <div className="text-muted-foreground text-xs">NeMo Guardrails · rail flow</div>
          </div>
          <Switch
            checked={draft.jailbreakEnabled}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(checked) => setDraft({ ...draft, jailbreakEnabled: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-3 border-b py-3">
          <div>
            <div className="text-sm font-medium">Topical Rail</div>
            <div className="text-muted-foreground text-xs">NeMo Guardrails · rail flow</div>
          </div>
          <Switch
            checked={draft.topicalEnabled}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(checked) => setDraft({ ...draft, topicalEnabled: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">PII Redaction</div>
            <div className="text-muted-foreground text-xs">Microsoft Presidio</div>
            <div
              className={cn(
                "mt-2 flex flex-wrap gap-1.5 transition-opacity",
                !piiOn && "pointer-events-none opacity-40",
              )}
            >
              {saved.available_pii_entities.map((entity) => {
                const on = draft.piiEntities.includes(entity);
                return (
                  <button
                    key={entity}
                    type="button"
                    disabled={!canEdit || !piiOn || update.isPending}
                    onClick={() => toggleEntity(entity)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                      on
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "text-muted-foreground border-input",
                      canEdit && "cursor-pointer",
                    )}
                  >
                    {ENTITY_LABELS[entity] ?? entity}
                  </button>
                );
              })}
            </div>
          </div>
          <Switch
            checked={piiOn}
            disabled={!canEdit || update.isPending}
            onCheckedChange={togglePiiMaster}
          />
        </div>

        {isDirty && (
          <div className="bg-muted flex items-center gap-3 rounded-md p-3 text-sm">
            <span className="bg-dark-yellow h-2 w-2 shrink-0 rounded-full" />
            <span className="flex-1">Unsaved changes</span>
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() =>
                setDraft({
                  piiEntities: saved.pii_entities,
                  jailbreakEnabled: saved.jailbreak_enabled,
                  topicalEnabled: saved.topical_enabled,
                })
              }
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  projectId,
                  // draft.piiEntities is string[] because it's threaded
                  // through from the server's general-purpose read schema;
                  // filter rather than blindly cast, so an unrecognized
                  // value from a future server response can't reach the
                  // enum-validated mutation input.
                  piiEntities: draft.piiEntities.filter((e): e is PiiEntity =>
                    (ALL_PII_ENTITIES as readonly string[]).includes(e),
                  ),
                  jailbreakEnabled: draft.jailbreakEnabled,
                  topicalEnabled: draft.topicalEnabled,
                })
              }
            >
              {update.isPending ? "Saving…" : "Save & apply"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
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

      <AcmeGuardrailsPolicies projectId={projectId} />

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
