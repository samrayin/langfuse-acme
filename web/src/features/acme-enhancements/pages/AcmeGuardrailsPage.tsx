import Page from "@/src/components/layouts/page";
import { AcmeGuardrailsTable } from "@/src/features/acme-enhancements/components/AcmeGuardrailsTable";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

const headerProps = {
  title: "Guardrails",
  help: {
    description:
      "Runtime policy enforcement and PII redaction from rayin-guardrails — " +
      "sits between a model call and its caller, before either reaches the " +
      "other side.",
  },
};

export default function AcmeGuardrailsPage() {
  const projectId = useProjectIdFromURL();

  return (
    <Page headerProps={headerProps} scrollable withPadding>
      {projectId ? <AcmeGuardrailsTable projectId={projectId} /> : null}
    </Page>
  );
}
