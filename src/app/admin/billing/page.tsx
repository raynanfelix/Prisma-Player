import { redirect } from "next/navigation";

/** Consolidado em /admin/finance (planos + checkouts + MRR). */
export default function AdminBillingRedirect() {
  redirect("/admin/finance");
}
