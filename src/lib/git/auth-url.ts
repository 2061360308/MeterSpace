/**
 * Build an authenticated git clone URL for a provider.
 * - GitHub: https://TOKEN@github.com/user/repo.git
 * - CNB:    https://oauth2:TOKEN@cnb.cool/user/repo.git
 */
export function buildAuthUrl(
  provider: string,
  repoUrl: string,
  token: string,
): string {
  const normalized = repoUrl.endsWith(".git")
    ? repoUrl
    : `${repoUrl}.git`;
  const u = new URL(normalized);
  if (provider === "cnb") {
    u.username = "oauth2";
    u.password = token;
  } else {
    u.username = token;
    u.password = "";
  }
  return u.toString();
}
