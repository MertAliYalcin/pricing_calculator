import { redirect } from "next/navigation";

/** `/llms` has no content of its own — the two sheets live at symmetric URLs under it. */
export default function LlmsIndexPage() {
  redirect("/llms/models");
}
