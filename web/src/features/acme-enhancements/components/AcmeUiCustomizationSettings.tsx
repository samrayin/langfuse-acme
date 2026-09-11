import { Check } from "lucide-react";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useHasProjectAccess } from "@/src/features/rbac";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import {
  ACME_ACCENT_COLOR_KEYS,
  ACME_ACCENT_COLOR_PRESETS,
  ACME_HEADER_BACKGROUND_KEYS,
  ACME_HEADER_BACKGROUND_PRESETS,
  ACME_THEME_DEFAULT,
  type AcmeAccentColorKey,
  type AcmeHeaderBackgroundKey,
} from "@/src/features/acme-enhancements/theme/acmeThemePresets";

export function AcmeUiCustomizationSettings({
  projectId,
}: {
  projectId: string;
}) {
  const utils = api.useUtils();
  const canEdit = useHasProjectAccess({ projectId, scope: "project:update" });

  const theme = api.acmeTheme.get.useQuery({ projectId });
  const current = theme.data ?? ACME_THEME_DEFAULT;

  const update = api.acmeTheme.update.useMutation({
    onSuccess: () => {
      utils.acmeTheme.get.invalidate({ projectId });
      showSuccessToast({
        title: "Theme updated",
        description: "The new colors are live for everyone in this project.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to update theme", error.message);
    },
  });

  const setAccentColor = (accentColor: AcmeAccentColorKey) => {
    update.mutate({
      projectId,
      accentColor,
      headerBackground: current.headerBackground,
    });
  };

  const setHeaderBackground = (headerBackground: AcmeHeaderBackgroundKey) => {
    update.mutate({
      projectId,
      accentColor: current.accentColor,
      headerBackground,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Accent color</CardTitle>
          <CardDescription>
            Used for buttons, links, and active navigation across the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {ACME_ACCENT_COLOR_KEYS.map((key) => {
              const preset = ACME_ACCENT_COLOR_PRESETS[key];
              const isSelected = current.accentColor === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canEdit || update.isPending}
                  onClick={() => setAccentColor(key)}
                  className={cn(
                    "flex w-24 flex-col items-center gap-2 rounded-md border p-3 text-xs transition-colors",
                    isSelected
                      ? "border-primary ring-primary ring-1"
                      : "border-border hover:border-primary/50",
                    !canEdit && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: preset.swatch }}
                  >
                    {isSelected && (
                      <Check className="h-4 w-4 text-white" strokeWidth={3} />
                    )}
                  </span>
                  {preset.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top bar background</CardTitle>
          <CardDescription>
            The strip behind the breadcrumb at the top of every page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {ACME_HEADER_BACKGROUND_KEYS.map((key) => {
              const preset = ACME_HEADER_BACKGROUND_PRESETS[key];
              const isSelected = current.headerBackground === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canEdit || update.isPending}
                  onClick={() => setHeaderBackground(key)}
                  className={cn(
                    "flex w-40 flex-col items-start gap-2 rounded-md border p-3 text-left text-xs transition-colors",
                    isSelected
                      ? "border-primary ring-primary ring-1"
                      : "border-border hover:border-primary/50",
                    !canEdit && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-medium">{preset.label}</span>
                    {isSelected && (
                      <Check className="text-primary h-4 w-4" strokeWidth={3} />
                    )}
                  </div>
                  <div
                    className={cn(
                      "h-6 w-full rounded border",
                      key === "plain" && "bg-background",
                      key === "tinted" && "bg-[hsl(var(--primary)/0.10)]",
                      key === "gradient" &&
                        "bg-gradient-to-b from-[hsl(var(--primary)/0.25)] to-background",
                    )}
                  />
                  <span className="text-muted-foreground">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {!canEdit && (
        <p className="text-muted-foreground text-sm">
          Only project owners and admins can change these settings. Everyone
          in the project sees the current choice.
        </p>
      )}
    </div>
  );
}
