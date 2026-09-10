import { NextRequest } from "next/server";
import { z } from "zod";
import net from "node:net";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  clashSubscription: z.string().max(2000).optional(),
  clashYaml: z.string().max(100000).optional(),
  upstreamUrl: z.string().max(500).optional(),
});

const timeout = (ms: number) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms),
  );

async function fetchWithTimeout(url: string, ms = 8000) {
  return Promise.race([fetch(url, { signal: AbortSignal.timeout(ms) }), timeout(ms)]);
}

function looksLikeYamlWithConfig(yaml: string): string | null {
  const text = yaml.replace(/^\uFEFF/, "");
  if (!/proxies:/m.test(text)) {
    return "YAML 中缺少顶层 proxies: 节点";
  }
  const proxiesBlock = yaml.split("\n").findIndex((l) => /^proxies:/.test(l));
  if (proxiesBlock < 0) return null;
  const rest = yaml
    .split("\n")
    .slice(proxiesBlock + 1)
    .join("\n");
  const proxyEntries = rest.match(
    /^\s*-\s+[^\n]*?(?=\r?\n\s*-\s|\r?\n\S|\r?\n\s*\w+:\s|\s*$)/gm,
  );
  if (!proxyEntries || proxyEntries.length === 0) {
    return "proxies: 下未找到任何代理条目";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const body = bodySchema.parse(await req.json());
    const results: Record<string, { ok: boolean; detail: string }> = {};

    if (body.upstreamUrl !== undefined && body.upstreamUrl.trim() !== "") {
      const raw = body.upstreamUrl.trim();
      let url: URL;
      try {
        url = new URL(raw.includes("://") ? raw : `http://${raw}`);
      } catch {
        results.upstream = { ok: false, detail: "不是合法的代理地址" };
        return ok({ results });
      }
      const scheme = url.protocol.replace(":", "");
      if (!["http", "socks5", "socks5h", "https"].includes(scheme) || !url.hostname) {
        results.upstream = { ok: false, detail: "仅支持 http / socks5(s) 代理地址" };
        return ok({ results });
      }
      const port = url.port ? Number(url.port) : scheme === "http" ? 80 : 1080;
      await new Promise<void>((resolveSchema) => {
        const sock = net.createConnection({ host: url.hostname, port });
        sock.setTimeout(4000);
        sock.once("connect", () => {
          results.upstream = { ok: true, detail: `${url.hostname}:${port} 可达` };
          sock.destroy();
          resolveSchema();
        });
        sock.once("timeout", () => {
          results.upstream = { ok: false, detail: `${url.hostname}:${port} 连接超时` };
          sock.destroy();
          resolveSchema();
        });
        sock.once("error", (e) => {
          results.upstream = { ok: false, detail: `${url.hostname}:${port} 不可达 (${(e as Error).message})` };
          resolveSchema();
        });
      });
    }

    if (body.clashSubscription !== undefined && body.clashSubscription.trim() !== "") {
      const raw = body.clashSubscription.trim();
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        results.clashSubscription = { ok: false, detail: "不是合法的订阅 URL" };
        return ok({ results });
      }
      if (!["http", "https"].includes(url.protocol.replace(":", ""))) {
        results.clashSubscription = { ok: false, detail: "订阅必须是 http/https 地址" };
        return ok({ results });
      }
      try {
        const resp = await fetchWithTimeout(raw);
        if (!resp.ok) {
          results.clashSubscription = { ok: false, detail: `HTTP ${resp.status}` };
        } else {
          const text = await resp.text();
          const head = text.slice(0, 500);
          let detail = `HTTP ${resp.status}`;
          let okFlag = true;
          if (/xml/i.test(head.slice(0, 200))) {
            okFlag = false;
            detail = "返回内容疑似 HTML/XML 而非 Clash 配置";
          }
          results.clashSubscription = { ok: okFlag, detail };
        }
      } catch {
        results.clashSubscription = { ok: false, detail: "订阅地址不可访问" };
      }
    }

    if (body.clashYaml !== undefined && body.clashYaml.trim() !== "") {
      const err = looksLikeYamlWithConfig(body.clashYaml);
      results.clashYaml = err ? { ok: false, detail: err } : { ok: true, detail: "包含 proxies 节点" };
    }

    return ok({ results });
  } catch (e) {
    return fail(e);
  }
}