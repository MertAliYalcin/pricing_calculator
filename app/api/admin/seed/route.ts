import { NextResponse } from "next/server";
import { main as seed } from "@/prisma/seed";

/**
 * TEMPORARY one-time endpoint to seed a fresh database (e.g. Supabase) from Vercel, where the
 * app can reach the DB but the operator's local network cannot. Already sits behind the
 * app-wide Basic Auth in middleware.ts. Delete this file after use — it does a full wipe+reseed
 * on every call, which would destroy any saved estimates entered after seeding.
 */
export async function POST() {
  await seed();
  return NextResponse.json({ ok: true });
}
