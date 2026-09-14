/**
 * ECS AutoReleaseTime 的唯一构造入口。
 *
 * 阿里云约束（RunInstances / ModifyInstanceAutoReleaseTime）：
 * - ISO 8601，UTC+0，格式 `yyyy-MM-ddTHH:mm:ssZ`
 *
 * 自动释放周期语义为「分钟」，取值 [35, 7200]（docs/AGENT-LIFECYCLE.md §7.2）。
 * 35 分钟下限已远超阿里云的半小时约束，无需再加 MIN_LEAD 缓冲。
 * 输出整分时刻（秒/毫秒归零）以避免每次续期后剩余时间因秒级漂移而缩短。
 */

/** 最小周期（分钟）。35 > 30，天然满足阿里云「当前时间半小时之后」的下限。 */
export const MIN_RENEWAL_MINUTES = 35;

/** 最大周期（分钟，≈120 小时）。 */
export const MAX_RENEWAL_MINUTES = 7200;

/**
 * 把「从现在起 N 分钟」转成云厂商可接受的 AutoReleaseTime。
 *
 * @param autoRenewalMinutes 自动释放周期（分钟），越界会 clamp 到 [35, 7200]
 * @param fromMs 基准时刻，默认当前；测试时可注入
 */
export function buildAutoReleaseTime(
  autoRenewalMinutes: number,
  fromMs: number = Date.now(),
): string {
  const clamped = Math.min(
    MAX_RENEWAL_MINUTES,
    Math.max(MIN_RENEWAL_MINUTES, Math.round(autoRenewalMinutes)),
  );
  // 向上取整到整分：绝不比请求周期更短。
  const targetMs = fromMs + clamped * 60_000;
  const wholeMinMs = Math.ceil(targetMs / 60_000) * 60_000;
  return new Date(wholeMinMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}