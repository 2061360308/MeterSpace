import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGitToken } from "@/lib/git/service";
import { listGithubRepos } from "@/lib/git/github";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const provider = req.nextUrl.searchParams.get("provider") ?? "github";
    const token = await getGitToken(userId, provider);
    if (!token) return fail(Object.assign(new Error("Not authorized"), { status: 401 }));

    const repos = await listGithubRepos(token);
    return ok({ repos });
  } catch (e) {
    return fail(e);
  }
}
