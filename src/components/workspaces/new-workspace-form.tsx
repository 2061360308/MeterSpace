"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui";
import {
  REGIONS,
  INSTANCE_TYPES,
  DISK_CATEGORIES,
  SPOT_STRATEGIES,
  DEFAULT_IMAGE_URI,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { SpotPriceChart } from "@/components/workspaces/spot-price-chart";

interface FeatureDef {
  id: string;
  name: string;
  description: string;
  companion: string;
  versions: { version: string; label: string }[];
}

interface PriceResult {
  hourly: { instance: number; disk: number; bandwidth: number; total: number };
  estimates: { hours: number; total: number; label: string }[];
  spotAdvice?: {
    releaseRate: number;
    historicalDiscount: number;
    estimatedSpotPrice: number;
  };
}

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("cn-hangzhou");
  const [instanceType, setInstanceType] = useState("ecs.g6.xlarge");
  const [diskCategory, setDiskCategory] = useState("cloud_essd");
  const [diskSize, setDiskSize] = useState(40);
  const [bandwidth, setBandwidth] = useState(10);
  const [spotStrategy, setSpotStrategy] = useState("NoSpot");
  const [spotDuration, setSpotDuration] = useState(1);
  const [spotPriceLimit, setSpotPriceLimit] = useState("");
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

  const [price, setPrice] = useState<PriceResult | null>(null);
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

  const fetchPrice = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch("/api/price/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          instanceType,
          diskCategory,
          diskSize,
          bandwidth,
          spotStrategy,
          spotDuration,
          spotPriceLimit: spotPriceLimit ? Number(spotPriceLimit) : null,
          durationHours: 4,
        }),
      });
      if (res.ok) {
        setPrice(await res.json());
      }
    }, 300);
  }, [
    region,
    instanceType,
    diskCategory,
    diskSize,
    bandwidth,
    spotStrategy,
    spotDuration,
    spotPriceLimit,
  ]);

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
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          region,
          instanceType,
          diskCategory,
          diskSize,
          bandwidth,
          publicIp: true,
          spotStrategy,
          spotDuration,
          spotPriceLimit: spotPriceLimit ? Number(spotPriceLimit) : null,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">新建工作区</h1>
      </div>

      <Card className="space-y-6 p-6">
        <div>
          <Label>名称</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
          />
        </div>

        <section className="space-y-4">
          <h2 className="font-medium">① 实例规格</h2>
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
              <Label>实例规格</Label>
              <Select
                value={instanceType}
                onChange={(e) => setInstanceType(e.target.value)}
              >
                {INSTANCE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} ({t.note})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>磁盘类型</Label>
              <Select
                value={diskCategory}
                onChange={(e) => setDiskCategory(e.target.value)}
              >
                {DISK_CATEGORIES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>磁盘大小 (GB)</Label>
              <Input
                type="number"
                value={diskSize}
                onChange={(e) => setDiskSize(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>公网带宽 (Mbps)</Label>
              <Input
                type="number"
                value={bandwidth}
                onChange={(e) => setBandwidth(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>抢占策略</Label>
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
            {spotStrategy !== "NoSpot" && (
              <>
                <div>
                  <Label>抢占保障 (小时)</Label>
                  <Select
                    value={spotDuration}
                    onChange={(e) => setSpotDuration(Number(e.target.value))}
                  >
                    <option value={0}>0（无保障）</option>
                    <option value={1}>1 小时</option>
                  </Select>
                </div>
                {spotStrategy === "SpotWithPriceLimit" && (
                  <div>
                    <Label>固定上限价 (元/小时)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={spotPriceLimit}
                      onChange={(e) => setSpotPriceLimit(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-medium">② 环境镜像</h2>
          <div>
            <Label>Docker 镜像地址</Label>
            <Input
              value={imageUri}
              onChange={(e) => setImageUri(e.target.value)}
              placeholder="registry.cn-hangzhou.aliyuncs.com/ns/repo:tag"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-medium">③ 开发工具 (Features)</h2>
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
                  <div className="text-xs text-gray-500">
                    配套: {f.companion}
                  </div>
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

        <section className="space-y-4">
          <h2 className="font-medium">④ Git 仓库</h2>
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
            <div className="grid grid-cols-2 gap-4">
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
                <Input
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">⑤ 价格预估</h2>
          {price ? (
            <div className="rounded-md bg-gray-50 p-4 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-gray-600">每小时总价</span>
                <span className="text-lg font-semibold">
                  {formatCurrency(price.hourly.total)}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                实例 {formatCurrency(price.hourly.instance)} · 系统盘{" "}
                {formatCurrency(price.hourly.disk)} · 带宽{" "}
                {formatCurrency(price.hourly.bandwidth)}
              </div>
              {price.spotAdvice && (
                <div className="mt-1 text-xs text-gray-500">
                  释放率 {(price.spotAdvice.releaseRate * 100).toFixed(0)}% ·
                  历史折扣 {(price.spotAdvice.historicalDiscount * 100).toFixed(0)}%
                  · 预估抢占价{" "}
                  {formatCurrency(price.spotAdvice.estimatedSpotPrice)}/时
                </div>
              )}
              <div className="mt-2 flex gap-3">
                {price.estimates.map((e) => (
                  <span key={e.hours} className="text-xs text-gray-600">
                    {e.label}: {formatCurrency(e.total)}
                  </span>
                ))}
              </div>
              {spotStrategy !== "NoSpot" && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    近 30 天抢占价格
                  </p>
                  <SpotPriceChart
                    region={region}
                    instanceType={instanceType}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">计算中...</p>
          )}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" onClick={onSubmit} disabled={loading || !name}>
          {loading ? <Spinner /> : "创建工作区 🚀"}
        </Button>
      </Card>
    </div>
  );
}
