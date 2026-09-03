import type { Metadata } from "next";
import { VaultClient } from "@/components/vault/VaultClient";

export const metadata: Metadata = {
  title: "Vocabulary",
  description:
    "Saved words with their real context sentence, a timestamp back to the moment, and SM-2 spaced repetition.",
};

export default function VaultPage() {
  return <VaultClient />;
}
