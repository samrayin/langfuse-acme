import { Mail } from "lucide-react";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";

const ACME_SUPPORT_EMAIL = "helpdesk@almoayyedcomputers.com";

/** ACME Enhancements nav entry: direct mailto link to the ACME support desk. */
export function AcmeContactSupportNavItem() {
  return (
    <SidebarMenuButton asChild tooltip="Contact ACME Support">
      <a href={`mailto:${ACME_SUPPORT_EMAIL}`}>
        <Mail />
        <span>Contact ACME Support</span>
      </a>
    </SidebarMenuButton>
  );
}
