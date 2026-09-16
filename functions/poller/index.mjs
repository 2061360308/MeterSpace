/**
 * 平台无关的实例跟踪轮询器（docs/CLOUD-FUNCTION-WORKERS.md §7，D1 平台无关）。
 *
 * AWS Lambda / 阿里云 FC（SCF）共用同一份代码：
 *   - Lambda：  入口 `exports.handler`
 *   - 阿里云 FC：入口 `exports.main_handler`
 * 都在 Node.js 18+ runtime 上跑原生 fetch，无第三方依赖。
 *
 * 事件负载（由后端 `enqueueTracking` 投递）：
 *   { task: "instance-tracking", instanceId, intervalSec=10, timeoutSec }
 *     - create   timeoutSec = 600（< FC 900s 上限）
 *     - release  timeoutSec = 660
 *
 * 行为：每 intervalSec 调一次 `POST /api/internal/instances/:id/poll`，
 * 直到返回非 PENDING（SUCCEEDED / FAILED / TIMEOUT）或预算耗尽。
 * 预算耗尽时不做任何兜底 —— 由上游 ECS AutoReleaseTime 兜金钱（D2）。
 *
 * 环境变量：
 *   RUNNER_URL              本站根地址，如 https://app.example.com
 *   TASKS_WORKER_TOKEN      与后端同值，poll 端点 Bearer 鉴权
 */

const RUNNER_URL = (process.env.RUNNER_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.TASKS_WORKER_TOKEN ?? "";
const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 600_000;

function parseEvent(event) {
  if (event && typeof event === "object") return event;
  if (typeof event === "string") {
    try {
      return JSON.parse(event);
    } catch {
      /* fall through */
    }
  }
  return {};
}

async function pollOnce(instanceId) {
  const res = await fetch(
    `${RUNNER_URL}/api/internal/instances/${encodeURIComponent(instanceId)}/poll`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`poll HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data?.state;
}

async function run(event) {
  if (!RUNNER_URL) throw new Error("RUNNER_URL is not set");
  if (!TOKEN) throw new Error("TASKS_WORKER_TOKEN is not set");
  const instanceId = event.instanceId;
  if (!instanceId) throw new Error("event.instanceId is missing");

  const intervalMs = Number(event.intervalSec ?? 0) * 1000 || DEFAULT_INTERVAL_MS;
  const timeoutMs = Number(event.timeoutSec ?? 0) * 1000 || DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  let state;

  do {
    try {
      state = await pollOnce(instanceId);
    } catch (e) {
      // 单次 poll 非 2xx / 网络错误：不抛出让整个跟踪终止，
      // 照常 sleep 后重试（docs/CLOUD-FUNCTION-WORKERS.md §6.3「网络失败照常重试」）。
      // 只要预算（timeoutMs）未耗尽就继续；云 AutoReleaseTime 是最后的金钱兜底。
      console.warn("[poller] poll attempt failed, will retry:", e?.message ?? e);
      state = "PENDING";
    }
    if (state === "PENDING" && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } while (state === "PENDING" && Date.now() - started < timeoutMs);

  return {
    task: event.task ?? "instance-tracking",
    instanceId,
    state,
    elapsedMs: Date.now() - started,
  };
}

/** AWS Lambda 入口 */
export async function handler(event) {
  return await run(parseEvent(event));
}

/** 阿里云 FC 入口 */
export const main_handler = handler;