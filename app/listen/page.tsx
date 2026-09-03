import { redirect } from "next/navigation";

/** Listening moved to the front door; old links still land in the right place. */
export default function ListenPage() {
  redirect("/");
}
