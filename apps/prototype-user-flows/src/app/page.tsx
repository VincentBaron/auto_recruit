import type { Metadata } from "next";
import { Landing } from "@/components/screens/setup/landing";

export const metadata: Metadata = { title: { absolute: "Auto Recruit - agents for agency recruiters" } };

export default function HomePage() {
  return <Landing />;
}
