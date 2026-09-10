import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, workspaces, settings, type Workspace } from "@/lib/db/schema";
import { fail } from "@/lib/api";
import {
  resolveProxyConfig,
  CLASH_LOCAL_PORT,
} from "@/lib/proxy/resolve";

const querySchema = z.object({
  instanceId: z.string().min(1),
  token: z.string().min(1),
});

function q(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function toB64(v: string | null | undefined): string {
  return Buffer.from(v ?? "").toString("base64");
}

/** Render a bash array literal from strings (quoted safely). */
function bashArray(items: string[]): string {
  return items
    .filter((i) => i)
    .map((i) => `"${i.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(" ");
}

function generateDevcontainerJson(workspace: Workspace): string {
  const devcontainer: Record<string, unknown> = {
    name: `workspace-${workspace.id}`,
    image: workspace.imageUri,
    workspaceFolder: "/workspace",
    workspaceMount: "source=/workspace,target=/workspace,type=bind",
  };

  return JSON.stringify(devcontainer, null, 2);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      instanceId: url.searchParams.get("instanceId"),
      token: url.searchParams.get("token"),
    });
    if (!parsed.success) {
      return fail({ message: "Missing instanceId or token", status: 400 });
    }

    const { instanceId, token } = parsed.data;

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, instanceId),
    });
    if (!instance) {
      return fail({ message: "Instance not found", status: 404 });
    }

    if (instance.accessToken !== token) {
      return fail({ message: "Invalid token", status: 403 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, instance.workspaceId),
    });
    if (!workspace) {
      return fail({ message: "Workspace not found", status: 404 });
    }

    const templatePath = join(process.cwd(), "scripts", "startup.sh");
    let template = await readFile(templatePath, "utf-8");

    const ramRoleName = "workspace-cloud-ecs-role";
    const callbackUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    // --- 出口代理配置：全局设置 + 工作区覆盖 → 注入引导块 ---
    const userSettings = await db.query.settings.findFirst({
      where: eq(settings.userId, workspace.userId),
    });
    const proxyCfg = resolveProxyConfig(userSettings ?? null, workspace);
    const proxyBootstrapPath = join(process.cwd(), "scripts", "proxy-bootstrap.sh");
    const proxyBootstrap = (await readFile(proxyBootstrapPath, "utf-8"))
      .replace(/\{\{NET_MODE\}\}/g, proxyCfg.mode)
      .replace(/\{\{CLASH_SUBSCRIPTION_B64\}\}/g, toB64(proxyCfg.clashSubscription))
      .replace(/\{\{CLASH_YAML_B64\}\}/g, toB64(proxyCfg.clashYaml))
      .replace(/\{\{UPSTREAM_URL_B64\}\}/g, toB64(proxyCfg.upstreamUrl))
      .replace(/\{\{UPSTREAM_USERNAME_B64\}\}/g, toB64(proxyCfg.upstreamUsername))
      .replace(/\{\{UPSTREAM_SECRET_B64\}\}/g, toB64(proxyCfg.upstreamSecret))
      .replace(/\{\{CLASH_BIN_FALLBACK_B64\}\}/g, toB64(proxyCfg.clashBinUrl))
      .replace(/\{\{PLATFORM_BASE\}\}/g, callbackUrl)
      .replace(
        /\{\{PLATFORM_HOST\}\}/g,
        (() => {
          try {
            return new URL(callbackUrl).host;
          } catch {
            return "";
          }
        })(),
      )
      .replace(/\{\{PROXY_PROBE_URLS_ARR\}\}/g, bashArray(proxyCfg.probeUrls))
      .replace(/\{\{PROXY_BYPASS_ARR\}\}/g, bashArray(proxyCfg.bypass))
      .replace(/\{\{CLASH_PORT\}\}/g, String(CLASH_LOCAL_PORT));

    const acrLogin = workspace.imageUri.match(/registry\..*\.aliyuncs\.com\//)
      ? `STS=$(curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/${ramRoleName})
AK_ID=$(echo "$STS" | jq -r '.AccessKeyId')
AK_SECRET=$(echo "$STS" | jq -r '.AccessKeySecret')
docker login ${q(`registry.${workspace.region}.aliyuncs.com`)} --username="\${AK_ID}" --password="\${AK_SECRET}"`
      : `echo "[acr] image is not from ACR, skip login"`;

    const gitBlock =
      workspace.gitRepoUrl && workspace.autoClone
        ? `if [ -n "${workspace.gitRepoUrl}" ] && [ "${workspace.autoClone}" = "true" ]; then
  cd /workspace
  if [ -d ".git" ]; then
    git pull origin ${q(workspace.gitBranch ?? "main")}
  else
    git clone -b ${q(workspace.gitBranch ?? "main")} ${workspace.gitRepoUrl} .
  fi
fi`
        : `echo "[git] auto-clone disabled"`;

    const featuresLoop = workspace.features?.length
      ? `echo '${JSON.stringify(workspace.features)}' | jq -c '.[]' | while read -r feature; do
  FEATURE_ID=$(echo "$feature" | jq -r '.id')
  FEATURE_SCRIPT=$(echo "$feature" | jq -r '.installScript')
  echo "[feature] Installing \${FEATURE_ID}..."
  docker exec -u root workspace bash -lc "\$FEATURE_SCRIPT"
  echo "[feature] \${FEATURE_ID} installed."
done`
      : `echo "[features] No features to install"`;

    const customScriptsLoop = "echo \"[scripts] No custom scripts\"";

    const devcontainerJson = generateDevcontainerJson(workspace)
      .replace(/'/g, "'\\''");

    template = template
      .replace(/\{\{PROXY_BOOTSTRAP\}\}/g, proxyBootstrap)
      .replace(/\{\{DEVCONTAINER_JSON\}\}/g, devcontainerJson)
      .replace(/\{\{ACR_LOGIN\}\}/g, acrLogin)
      .replace(/\{\{OSS_WORKSPACE_PATH\}\}/g, workspace.ossWorkspacePath ?? `ws-${workspace.id}/workspace`)
      .replace(/\{\{GIT_BLOCK\}\}/g, gitBlock)
      .replace(/\{\{FEATURES_LOOP\}\}/g, featuresLoop)
      .replace(/\{\{CUSTOM_SCRIPTS_LOOP\}\}/g, customScriptsLoop)
      .replace(/\{\{WORKSPACE_ID\}\}/g, workspace.id)
      .replace(/\{\{CALLBACK_URL\}\}/g, callbackUrl)
      .replace(/\{\{ACCESS_TOKEN\}\}/g, instance.accessToken ?? "")
      .replace(/\{\{OSS_BUCKET\}\}/g, `my-dev-workspace-${workspace.region}`)
      .replace(/\{\{REGION\}\}/g, workspace.region)
      .replace(/\{\{IMAGE_URI\}\}/g, workspace.imageUri)
      .replace(/\{\{RAM_ROLE_NAME\}\}/g, "workspace-cloud-ecs-role");

    return new Response(template, {
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e : new Error(String(e)));
  }
}