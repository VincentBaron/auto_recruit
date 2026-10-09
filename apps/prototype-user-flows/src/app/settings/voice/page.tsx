import type { Metadata } from "next";
import { VoiceScreen } from "@/components/screens/settings/voice-screen";

export const metadata: Metadata = { title: "Voice Profile" };

export default function VoiceProfilePage() {
  return <VoiceScreen />;
}
