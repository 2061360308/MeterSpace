"use client";

export interface NetworkSelection {
  publicIp: boolean;
  chargeType: "fixed" | "traffic"; // 按固定带宽 / 按使用流量
  bandwidth: number;
}

const BANDWIDTH_OPTIONS = [1, 2, 3, 5, 10, 50, 100];

export function NetworkSelector({
  value,
  onChange,
}: {
  value: NetworkSelection;
  onChange: (v: NetworkSelection) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.publicIp}
          onChange={(e) => onChange({ ...value, publicIp: e.target.checked })}
        />
        分配公网 IPv4 地址
      </label>

      <div className="text-sm">
        <div className="mb-2 text-gray-500">带宽计费模式</div>
        <div className="grid grid-cols-2 gap-2">
          <label
            onClick={() => onChange({ ...value, chargeType: "fixed" })}
            className={
              "cursor-pointer rounded-md border p-3 " +
              (value.chargeType === "fixed"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-blue-300")
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="chargeType"
                checked={value.chargeType === "fixed"}
                onChange={() => onChange({ ...value, chargeType: "fixed" })}
              />
              <span className="font-medium">按固定带宽</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              适用于流量较大、稳定的场景
            </div>
          </label>
          <label
            onClick={() => onChange({ ...value, chargeType: "traffic" })}
            className={
              "cursor-pointer rounded-md border p-3 " +
              (value.chargeType === "traffic"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-blue-300")
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="chargeType"
                checked={value.chargeType === "traffic"}
                onChange={() => onChange({ ...value, chargeType: "traffic" })}
              />
              <span className="font-medium">按使用流量</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              适用于流量小、波动大的场景
            </div>
          </label>
        </div>
      </div>

      <div className="text-sm">
        <div className="mb-2 text-gray-500">带宽峰值</div>
        <div className="flex flex-wrap items-center gap-2">
          {BANDWIDTH_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => onChange({ ...value, bandwidth: b })}
              className={
                "rounded-md border px-3 py-1.5 " +
                (value.bandwidth === b
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-600 hover:border-blue-300")
              }
            >
              {b} Mbps
            </button>
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={value.bandwidth}
          onChange={(e) => onChange({ ...value, bandwidth: Number(e.target.value) })}
          className="mt-2 w-full"
        />
        <div className="text-right text-gray-500">{value.bandwidth} Mbps</div>
      </div>
    </div>
  );
}
