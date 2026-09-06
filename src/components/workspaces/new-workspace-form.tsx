"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Select, Spinner } from "@/components/ui";
import {
  REGIONS,
  DEFAULT_IMAGE_URI,
  SPOT_STRATEGIES,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { InstanceSelector, type InstanceTypeInfo } from "@/components/workspaces/instance-selector";
import { DiskSelector, type DiskSelection } from "@/components/workspaces/disk-selector";
import { NetworkSelector, type NetworkSelection } from "@/components/workspaces/network-selector";
import { PricePanel, type PricePanelData } from "@/components/workspaces/price-panel";
import { SpotPriceChart } from "@/components/workspaces/spot-price-chart";

interface FeatureDef {
  id: string;
  name: string;
  description: string;
  companion: string;
  versions: { version: string; label: string }[];
}

export function NewWorkspaceForm() {
  const router = useRouter();
  // 付费类型 Tab
  const [billingMode, setBillingMode] = useState<"ondemand" | "spot">("ondemand");
  const [spotStrategy, setSpotStrategy] = useState("NoSpot");

  const [name, setName] = useState("");
  const [region, setRegion] = useState("cn-hangzhou");
  const [instanceType, setInstanceType] = useState("ecs.g6.xlarge");
  const [instanceTypes, setInstanceTypes] = useState<InstanceTypeInfo[]>([]);
  const [instanceTypesLoading, setInstanceTypesLoading] = useState(true);
  const [disk, setDisk] = useState<DiskSelection>({
    category: "cloud_essd",
    size: 40,
    releaseWithInstance: true,
    encrypted: false,
  });
  const [network, setNetwork] = useState<NetworkSelection>({
    publicIp: true,
    chargeType: "traffic",
    bandwidth: 10,
  });
  const [imageUri, setImageUri] = useState(DEFAULT_IMAGE_URI);

  const [featureDefs, setFeatureDefs] = useState<FeatureDef[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<
    Record<string, string>
  >({});

  const [autoClone, setAutoClone] = useState(true);
  const gitProvider = "github";
  const [repos, setRepos] = useState<{ fullName: string; defaultBranch: string }[]>([]);
  const [gitAuthed, setGitAuthed] = useState(false);
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("main");

  const [priceData, setPriceData] = useState<PricePanelData>({ loading: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/features")
      .then((r) => r.json())
      .then((d) => setFeatureDefs(d.features))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/git/repos?provider=github")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        setRepos(d.repos);
        setGitAuthed(true);
      })
      .catch(() => setGitAuthed(false));
  }, []);

  useEffect(() => {
    setInstanceTypesLoading(true);
    fetch(`/api/ecs/types?region=${encodeURIComponent(region)}`)
      .then((r) => r.json())
      .then((d) => setInstanceTypes(d.types ?? []))
      .catch(() => setInstanceTypes([]))
      .finally(() => setInstanceTypesLoading(false));
  }, [region]);

  const fetchPrice = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPriceData((p) => ({ ...p, loading: true }));
    timer.current = setTimeout(async () => {
      const strategy = billingMode === "spot" ? spotStrategy : "NoSpot";
      const res = await fetch("/api/price/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          instanceType,
          diskCategory: disk.category,
          diskSize: disk.size,
          bandwidth: network.bandwidth,
          spotStrategy: strategy,
          spotDuration: strategy !== "NoSpot" ? 1 : 1,
          durationHours: 4,
        }),
      });
      if (res.ok) {
        setPriceData({ loading: false, ...(await res.json()) });
      } else {
        setPriceData({ loading: false });
      }
    }, 300);
  }, [region, instanceType, disk.category, disk.size, network.bandwidth, billingMode, spotStrategy]);

  useEffect(() => {
    fetchPrice();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchPrice]);

  async function onSubmit() {
    setLoading(true);
    setError("");
    try {
      const features = Object.entries(selectedFeatures).map(([id, version]) => ({
        id,
        version,
      }));
      const strategy = billingMode === "spot" ? spotStrategy : "NoSpot";
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          region,
          instanceType,
          diskCategory: disk.category,
          diskSize: disk.size,
          bandwidth: network.bandwidth,
          publicIp: network.publicIp,
          spotStrategy: strategy,
          spotDuration: strategy !== "NoSpot" ? 1 : 1,
          imageUri,
          features,
          gitProvider: gitRepoUrl ? gitProvider : null,
          gitRepoUrl: gitRepoUrl || null,
          gitBranch,
          autoClone,
          releaseHours: null,
          idleMinutes: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      router.push(`/workspaces/${data.workspaceId}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  const sectionTitle = "mb-3 text-base font-semibold text-gray-800";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">新建工作区</h1>
      </div>

      {/* 付费类型 Tab */}
      <Card className="p-2">
        <div className="flex gap-4 px-3 py-2">
          <button
            onClick={() => setBillingMode("ondemand")}
            className={
              "text-left " +
              (billingMode === "ondemand"
                ? "font-medium text-blue-600"
                : "text-gray-500")
            }
          >
            <div>按量付费</div>
            <div className="text-xs text-gray-400">先使用后付费，按需开通</div>
          </button>
          <button
            onClick={() => setBillingMode("spot")}
            className={
              "text-left " +
              (billingMode === "spot"
                ? "font-medium text-blue-600"
                : "text-gray-500")
            }
          >
            <div>抢占式实例</div>
            <div className="text-xs text-gray-400">
              较按量付费最高可省 90%
            </div>
          </button>
        </div>
        {billingMode === "spot" && (
          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
            使用须知：无保护期或 1 小时保护期；超过保护期后当市场价格高于出价或资源供需变化时实例会被自动释放，请做好数据备份。
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* 左侧配置区 */}
        <div className="space-y-6">
          <Card className="space-y-5 p-6">
            <div>
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" />
            </div>

            {/* 地域 */}
            <section>
              <h2 className={sectionTitle}>地域及可用区</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>地域</Label>
                  <Select value={region} onChange={(e) => setRegion(e.target.value)}>
                    {REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>可用区</Label>
                  <Select defaultValue="">
                    <option value="">自动分配</option>
                  </Select>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                实例创建之后地域将无法更改；距离实例所在地域越近，访问速度越快
              </p>
            </section>

            {/* 实例规格 */}
            <section>
              <h2 className={sectionTitle}>实例规格</h2>
              {billingMode === "spot" && (
                <div className="mb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>实例使用时长</Label>
                      <Select defaultValue="1">
                        <option value="1">设定实例使用 1 小时</option>
                        <option value="0">无确定使用时长</option>
                      </Select>
                    </div>
                    <div>
                      <Label>单台实例上限价格</Label>
                      <Select
                        value={spotStrategy}
                        onChange={(e) => setSpotStrategy(e.target.value)}
                      >
                        {SPOT_STRATEGIES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <button className="text-xs text-blue-600 hover:underline">
                    查看历史价格
                  </button>
                </div>
              )}
              <InstanceSelector
                region={region}
                value={instanceType}
                types={instanceTypes}
                loading={instanceTypesLoading}
                onChange={setInstanceType}
              />
              <p className="mt-2 text-sm text-gray-500">
                当前选择：{instanceType} ·{" "}
                {
                  instanceTypes.find((t) => t.instanceTypeId === instanceType)
                    ?.cpuCoreCount
                }
                vCPU{" "}
                {
                  instanceTypes.find((t) => t.instanceTypeId === instanceType)
                    ?.memorySize
                }
                GiB
              </p>
            </section>

            {/* 镜像 */}
            <section>
              <h2 className={sectionTitle}>镜像</h2>
              <div>
                <Label>Docker 镜像地址</Label>
                <Input
                  value={imageUri}
                  onChange={(e) => setImageUri(e.target.value)}
                  placeholder="registry.cn-hangzhou.aliyuncs.com/ns/repo:tag"
                />
                <p className="mt-1 text-xs text-gray-400">
                  支持任意 Docker 镜像链接（ACR / ghcr.io / Docker Hub）
                </p>
              </div>
            </section>

            {/* 存储 */}
            <section>
              <h2 className={sectionTitle}>存储</h2>
              <DiskSelector value={disk} onChange={setDisk} />
            </section>

            {/* 网络 */}
            <section>
              <h2 className={sectionTitle}>网络和安全组</h2>
              <NetworkSelector value={network} onChange={setNetwork} />
            </section>

            {/* 开发工具 */}
            <section>
              <h2 className={sectionTitle}>开发工具 (Features)</h2>
              <div className="grid grid-cols-2 gap-3">
                {featureDefs.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 rounded-md border border-gray-200 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={f.id in selectedFeatures}
                      onChange={(e) => {
                        setSelectedFeatures((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) {
                            next[f.id] = f.versions[0]?.version ?? "latest";
                          } else {
                            delete next[f.id];
                          }
                          return next;
                        });
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-gray-500">配套: {f.companion}</div>
                    </div>
                    {f.id in selectedFeatures && (
                      <Select
                        className="w-28"
                        value={selectedFeatures[f.id]}
                        onChange={(e) =>
                          setSelectedFeatures((prev) => ({
                            ...prev,
                            [f.id]: e.target.value,
                          }))
                        }
                      >
                        {f.versions.map((v) => (
                          <option key={v.version} value={v.version}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Git */}
            <section>
              <h2 className={sectionTitle}>Git 仓库</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoClone}
                  onChange={(e) => setAutoClone(e.target.checked)}
                />
                自动拉取代码
              </label>
              {!gitAuthed ? (
                <a
                  href="/api/git/auth?provider=github&returnTo=/workspaces/new"
                  className="text-sm text-blue-600 hover:underline"
                >
                  授权 GitHub 后选择仓库 →
                </a>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div>
                    <Label>仓库</Label>
                    <Select
                      value={gitRepoUrl}
                      onChange={(e) => {
                        setGitRepoUrl(e.target.value);
                        const repo = repos.find((r) => r.fullName === e.target.value);
                        if (repo) setGitBranch(repo.defaultBranch);
                      }}
                    >
                      <option value="">不使用仓库</option>
                      {repos.map((r) => (
                        <option key={r.fullName} value={r.fullName}>
                          {r.fullName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>分支</Label>
                    <Input value={gitBranch} onChange={(e) => setGitBranch(e.target.value)} />
                  </div>
                </div>
              )}
            </section>
          </Card>
        </div>

        {/* 右侧配置概要 */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-gray-800">配置概要</h2>
            <dl className="space-y-2 text-sm">
              <SummaryRow label="付费类型" value={billingMode === "spot" ? "抢占式实例" : "按量付费"} />
              <SummaryRow label="地域" value={REGIONS.find((r) => r.id === region)?.label ?? region} />
              <SummaryRow label="实例规格" value={instanceType} />
              <SummaryRow
                label="抢占策略"
                value={billingMode === "spot" ? SPOT_STRATEGIES.find((s) => s.id === spotStrategy)?.label ?? spotStrategy : "—"}
              />
              <SummaryRow label="镜像" value={imageUri.split("/").slice(-1)[0]} />
              <SummaryRow label="系统盘" value={`${disk.category} ${disk.size}GiB`} />
              <SummaryRow label="公网带宽" value={`${network.chargeType === "fixed" ? "按固定带宽" : "按使用流量"} ${network.bandwidth}Mbps`} />
            </dl>
          </Card>

          {/* 价格明细 */}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-gray-800">价格明细</h2>
            {priceData.loading ? (
              <Spinner />
            ) : priceData.hourly ? (
              <div className="space-y-2 text-sm">
                <PriceRow label="实例" value={priceData.hourly.instance} />
                <PriceRow label="系统盘" value={priceData.hourly.disk} />
                <PriceRow label="带宽" value={priceData.hourly.bandwidth} />
                {billingMode === "spot" && priceData.spotAdvice && (
                  <div className="mt-2 rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                    <div>释放率 {(priceData.spotAdvice.releaseRate * 100).toFixed(0)}%</div>
                    <div>历史折扣 {(priceData.spotAdvice.historicalDiscount * 100).toFixed(0)}%</div>
                    <div>预估抢占价 {formatCurrency(priceData.spotAdvice.estimatedSpotPrice)}/时</div>
                  </div>
                )}
                {billingMode === "spot" && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">近 30 天抢占价格</p>
                    <SpotPriceChart region={region} instanceType={instanceType} />
                  </div>
                )}
                <div className="space-y-1 border-t border-gray-100 pt-2">
                  {priceData.estimates?.map((e) => (
                    <div key={e.hours} className="flex justify-between text-xs text-gray-500">
                      <span>{e.label}</span>
                      <span>{formatCurrency(e.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">无法获取价格</p>
            )}
          </Card>
        </div>
      </div>

      {error && (
        <div className="sticky bottom-16 z-10 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      {/* 底部 sticky 价格面板 */}
      <PricePanel
        data={priceData}
        billingMode={billingMode}
        onProceed={onSubmit}
        proceeding={loading}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{formatCurrency(value)}</span>
    </div>
  );
}
