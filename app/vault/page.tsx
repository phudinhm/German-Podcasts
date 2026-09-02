import type { Metadata } from "next";
import { VaultClient } from "@/components/vault/VaultClient";

export const metadata: Metadata = {
  title: "Vokabelheft",
  description:
    "Gespeicherte Wörter mit echtem Kontextsatz, Zeitstempel und verteilter Wiederholung nach SM-2.",
};

export default function VaultPage() {
  return <VaultClient />;
}
