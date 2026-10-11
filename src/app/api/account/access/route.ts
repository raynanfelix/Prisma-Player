import { NextResponse } from "next/server";
import { getCurrentAdminUser, getCurrentUserId } from "@/lib/auth/server";
import { getAccountAccess } from "@/lib/access/service";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [access, adminUser] = await Promise.all([getAccountAccess(userId), getCurrentAdminUser()]);
  return NextResponse.json({ ...access, isAdmin: Boolean(adminUser) }, { headers: { "cache-control": "no-store" } });
}
