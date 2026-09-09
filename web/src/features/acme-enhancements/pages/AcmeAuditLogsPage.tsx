import Page from "@/src/components/layouts/page";
import { AcmeAuditLogsTable } from "@/src/features/acme-enhancements/components/AcmeAuditLogsTable";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

const headerProps = {
  title: "Audit Logs",
  help: {
    description:
      "Every change made in this project, captured by ACME — included with " +
      "your ACME-managed deployment, no additional licensing required.",
  },
};

export default function AcmeAuditLogsPage() {
  const projectId = useProjectIdFromURL();

  return (
    <Page headerProps={headerProps}>
      {projectId ? <AcmeAuditLogsTable projectId={projectId} /> : null}
    </Page>
  );
}
