import { NextRequest, NextResponse } from "next/server";
import { registerUserWithTenant, AuthError } from "@sme/core/auth";
import { registerSchema } from "@sme/shared";
import { z } from "zod";

// ============================================
// POST /api/auth/register-with-tenant
//
// Self-service onboarding: creates user + first tenant in one step.
// SECURITY: Session token is set as an httpOnly cookie.
// ============================================

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

const registerWithTenantSchema = registerSchema.extend({
  tenantName: z.string().min(1).max(200).trim(),
  tenantSlug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
    .transform((v) => v.toLowerCase()),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerWithTenantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const result = await registerUserWithTenant({
      email: parsed.data.email,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
      tenantName: parsed.data.tenantName,
      tenantSlug: parsed.data.tenantSlug,
      ipAddress,
      userAgent,
    });

    // Build response WITHOUT the token
    const response = NextResponse.json({
      user: result.user,
      tenant: result.tenant,
      expiresAt: result.expiresAt,
    });

    // Set httpOnly cookie
    response.cookies.set("session_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Register with tenant error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
