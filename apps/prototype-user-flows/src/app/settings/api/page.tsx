import type { Metadata } from "next";
import { ApiScreen } from "@/components/screens/settings/api-screen";

export const metadata: Metadata = { title: "API & MCP" };

export default function ApiAndMcpPage() {
  return <ApiScreen />;
}
