import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAppBaseUrl } from "@/lib/workspaces/service";
import { exchangeGithubCode, getGithubUsername } from "@/lib/git/github";
import { storeGitToken } from "@/lib/git/service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const expectedState = req.cookies.get("git_oauth_state")?.value;
  const provider = req.cookies.get("git_oauth_provider")?.value ?? "github";
  const returnTo = req.cookies.get("git_oauth_return")?.value ?? "/workspaces/new";
  const base = getAppBaseUrl();

  const failUrl = `${base}${returnTo}?git=error`;
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(failUrl);
  }

  try {
    const userId = await requireUserId();
    const { accessToken } = await exchangeGithubCode(code);
    const username = await getGithubUsername(accessToken);
    await storeGitToken(userId, provider, accessToken, username);
    const res = NextResponse.redirect(`${base}${returnTo}?git=connected`);
    res.cookies.delete("git_oauth_state");
    res.cookies.delete("git_oauth_provider");
    res.cookies.delete("git_oauth_return");
    return res;
  } catch (e) {
    console.error("git callback error", e);
    return NextResponse.redirect(failUrl);
  }
}
