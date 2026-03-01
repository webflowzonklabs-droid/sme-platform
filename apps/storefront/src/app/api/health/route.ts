import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.execute(sql`SELECT 1 as ok`);
    return NextResponse.json({
      status: "ok",
      db: "connected",
      result: result[0],
      env: {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) + "...",
        tenant: process.env.TENANT_SLUG,
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "error",
      error: err.message,
      env: {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) + "...",
        tenant: process.env.TENANT_SLUG,
      },
    }, { status: 500 });
  }
}
