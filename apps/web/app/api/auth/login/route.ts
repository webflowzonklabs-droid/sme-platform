import { NextRequest, NextResponse } from "next/server";
import { loginWithPassword, AuthError } from "@sme/core/auth";
import { loginSchema } from "@sme/shared";

// ============================================
// POST /api/auth/login
//
// SECURITY: Session token is set as an httpOnly cookie in the response.
// The token NEVER appears in the response body, preventing XSS theft.
// ============================================

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

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

    const result = await loginWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress,
      userAgent,
    });

    // Build response WITHOUT the token
    const response = NextResponse.json({
      user: result.user,
      tenantId: result.tenantId,
      hasMultipleTenants: result.hasMultipleTenants,
      expiresAt: result.expiresAt,
    });

    // Set httpOnly cookie — token NEVER in the response body
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
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
