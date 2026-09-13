/**
 * ECS AutoReleaseTime 的唯一构造入口。
 *
 * 阿里云约束（RunInstances / ModifyInstanceAutoReleaseTime）：
 * - ISO 8601，UTC+0，格式 `yyyy-MM-ddTHH:mm:ssZ`
 * - 最短释放时间为「当前时间半小时之后」
 * - 最长不超过「当前时间三年」
 *
 * ⚠️ 为什么需要 MIN_LEAD_MS 缓冲：
 * `settings.default_release_hours` 允许 0.5（半小时）。若直接传 `now + 30min`，
 * 请求在网络中飞行的几百毫秒会让服务端判定为「29分59秒」→ 不足半小时
 * → `InvalidAutoReleaseTime.Malformed`（The specified parameter AutoReleaseTime is not valid.）。
 * 这是边界抖动，不是格式问题，也不是时区问题（阿里云要的就是 UTC）。
 */
const HALF_HOUR_MS = 30 * 60 * 1000;

/** 在半小时下限之上再留 1 分钟，抵消请求传输 + 服务端解析的时间漂移 */
const MIN_LEAD_MS = HALF_HOUR_MS + 60 * 1000;

/**
 * 把「从现在起 N 小时」转成阿里云可接受的 AutoReleaseTime。
 *
 * @param hours 保留时长（小时，支持小数，如 0.5）
 * @param fromMs 基准时刻，默认当前；测试时可注入
 */
export function buildAutoReleaseTime(
  hours: number,
  fromMs: number = Date.now(),
): string {
  const rawMs = fromMs + hours * 3600 * 1000;
  // 抬到安全下限：不足 now + 30min + 1min 一律按下限走
  const safeMs = Math.max(rawMs, fromMs + MIN_LEAD_MS);
  return new Date(safeMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}
