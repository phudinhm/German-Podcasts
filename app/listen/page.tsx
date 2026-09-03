import type { Metadata } from "next";
import { ListenClient } from "@/components/ListenClient";

export const metadata: Metadata = {
  title: "Direkt hören",
  description:
    "Öffentliche Podcast-Feeds sofort streamen, mit Tempo-Regelung und A-B-Schleife, auch ohne Transkript.",
};

export default function ListenPage() {
  return <ListenClient />;
}
