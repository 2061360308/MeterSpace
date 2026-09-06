const GITHUB_CLIENT_ID = process.env.GITHUB_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_SECRET;

export function githubConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

export function githubAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "repo read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export interface GitHubToken {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export async function exchangeGithubCode(code: string): Promise<GitHubToken> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) throw new Error("GitHub token exchange failed");
  const data = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
  };
  if (!data.access_token) {
    throw new Error(data.error ?? "GitHub token exchange failed");
  }
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? "bearer",
    scope: data.scope ?? "",
  };
}

export interface GitHubRepo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export async function listGithubRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch("https://api.github.com/user/repos?per_page=100", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Failed to list GitHub repos");
  const data = (await res.json()) as {
    full_name?: string;
    default_branch?: string;
    private?: boolean;
  }[];
  return data.map((r) => ({
    fullName: r.full_name ?? "",
    defaultBranch: r.default_branch ?? "main",
    private: r.private ?? false,
  }));
}

export async function listGithubBranches(
  token: string,
  repoFullName: string,
): Promise<string[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/branches?per_page=100`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error("Failed to list branches");
  const data = (await res.json()) as { name?: string }[];
  return data.map((b) => b.name ?? "").filter(Boolean);
}

export async function getGithubUsername(token: string): Promise<string> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return "";
  const data = (await res.json()) as { login?: string };
  return data.login ?? "";
}
