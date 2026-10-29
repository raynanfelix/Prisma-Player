import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/api/request";

const VALID_STATUSES = ["new", "investigating", "fixed", "validated", "reopened"] as const;

/**
 * PATCH /api/admin/errors — Update error event status.
 * Admin-only endpoint for triaging captured errors.
 */
export async function PATCH(request: Request) {
  try {
    await requireAdmin();

    const parsed = await readJsonBody<{ id?: unknown; status?: unknown }>(request);
    if (!parsed.ok) return parsed.response;

    const { id, status } = parsed.body ?? {};
    const numericId = typeof id === "number" ? id : typeof id === "string" ? parseInt(id, 10) : NaN;
    
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    if (typeof status !== "string" || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    const { errorEvents } = schema;
    const [updated] = await db
      .update(errorEvents)
      .set({ status })
      .where(eq(errorEvents.id, numericId))
      .returning({ id: errorEvents.id });

    if (!updated) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: updated.id, status });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}