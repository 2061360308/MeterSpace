import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAppBaseUrl } from "@/lib/workspaces/service";
import { githubAuthorizeUrl, githubConfigured } from "@/lib/git/github";
import { fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const provider = req.nextUrl.searchParams.get("provider") ?? "github";
    const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/workspaces/new";

    if (provider !== "github" || !githubConfigured()) {
      return fail(new Error("GitHub OAuth is not configured"));
    }

    const state = randomUUID();
    const redirectUri = `${getAppBaseUrl()}/api/git/callback`;
    const url = githubAuthorizeUrl(redirectUri, state);

    const res = NextResponse.redirect(url);
    res.cookies.set("git_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    res.cookies.set("git_oauth_provider", provider, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    res.cookies.set("git_oauth_return", returnTo, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return res;
  } catch (e) {
    return fail(e);
  }
}
