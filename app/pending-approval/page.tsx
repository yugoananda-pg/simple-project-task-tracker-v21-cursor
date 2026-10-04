import { redirect } from "next/navigation";

/**
 * Legacy hold page. Unapproved users are signed out at the edge and directed
 * to /login with an awaiting-approval notice.
 */
export default function PendingApprovalPage() {
  redirect("/login?notice=awaiting_approval");
}
