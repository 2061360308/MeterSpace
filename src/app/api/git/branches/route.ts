import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGitToken } from "@/lib/git/service";
import { listGithubBranches } from "@/lib/git/github";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const provider = req.nextUrl.searchParams.get("provider") ?? "github";
    const repo = req.nextUrl.searchParams.get("repo");
    if (!repo) return fail(new Error("repo is required"));

    const token = await getGitToken(userId, provider);
    if (!token) return fail(Object.assign(new Error("Not authorized"), { status: 401 }));

    const branches = await listGithubBranches(token, repo);
    return ok({ branches });
  } catch (e) {
    return fail(e);
  }
}
