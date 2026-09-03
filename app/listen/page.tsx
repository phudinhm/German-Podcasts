import type { Metadata } from "next";
import { ListenClient } from "@/components/ListenClient";

export const metadata: Metadata = {
  title: "Listen",
  description:
    "Find German podcasts on Apple Podcasts, Spotify, YouTube or any RSS feed and stream them straight away, with transcripts or live captions.",
};

export default function ListenPage() {
  return <ListenClient />;
}
