import type { Metadata } from "next";
import { MailboxesScreen } from "@/components/screens/settings/mailboxes-screen";

export const metadata: Metadata = { title: "Sending Mailboxes" };

export default function SendingMailboxesPage() {
  return <MailboxesScreen />;
}
