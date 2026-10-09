import { redirect } from "next/navigation";

// Settings has no page of its own: its first section is Sending Mailboxes, as in the sidebar.
export default function SettingsPage() {
  redirect("/settings/mailboxes");
}
