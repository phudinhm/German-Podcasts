import type { Metadata } from "next";
import { LibraryClient } from "@/components/LibraryClient";

export const metadata: Metadata = {
  title: "Library",
  description: "The shows you follow and the episodes you are part-way through.",
};

export default function LibraryPage() {
  return <LibraryClient />;
}
