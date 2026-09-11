import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

/**
 * Tailwind background class for PageHeader's top strip, driven by the
 * project's chosen header-background preset (see
 * ACME_HEADER_BACKGROUND_PRESETS). Uses the --primary CSS custom property
 * (already overridden per the chosen accent color by
 * AcmeThemeStyleInjector) rather than a hardcoded color, so the tint/
 * gradient always matches whichever accent color is currently selected.
 *
 * Shares its query with AcmeThemeStyleInjector (same tRPC query + input),
 * so this costs no extra network request.
 */
export function useAcmeHeaderBackgroundClassName(): string {
  const projectId = useProjectIdFromURL();
  const theme = api.acmeTheme.get.useQuery(
    { projectId: projectId ?? "" },
    {
      enabled: Boolean(projectId),
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  switch (theme.data?.headerBackground) {
    case "tinted":
      return "bg-[hsl(var(--primary)/0.06)]";
    case "gradient":
      return "bg-gradient-to-b from-[hsl(var(--primary)/0.12)] to-background";
    case "plain":
    default:
      return "bg-background";
  }
}
