"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { SettingGroup } from "@/components/settings/setting-item";

export type ProxySettingsValues = {
  proxyMode: "disabled" | "clash" | "upstream";
  proxyClashSubscription: string;
  proxyClashYaml: string;
  proxyUpstreamUrl: string;
  proxyUpstreamUsername: string;
  proxyUpstreamSecret: string;
  proxyProbeUrls: string[];
  proxyBypass: string[];
  clashBinUrl: string;
  hasSavedSecret: boolean;
};

export const DEFAULT_PROXY_VALUES: ProxySettingsValues = {
  proxyMode: "disabled",
  proxyClashSubscription: "",
  proxyClashYaml: "",
  proxyUpstreamUrl: "",
  proxyUpstreamUsername: "",
  proxyUpstreamSecret: "",
  proxyProbeUrls: [],
  proxyBypass: [],
  clashBinUrl: "",
  hasSavedSecret: false,
};

function toValues(data: Partial<ProxySettingsValues> | null | undefined): ProxySettingsValues {
  return {
    ...DEFAULT_PROXY_VALUES,
    ...data,
  };
}

export function ProxySettings({
  value,
  onChange,
  onTest,
  testing,
  saving,
}: {
  value: Partial<ProxySettingsValues> | undefined;
  onChange: (patch: Partial<ProxySettingsValues>) => void;
  onTest: () => void;
  testing: boolean;
  saving: boolean;
}) {
  const v = toValues(value);
  const mode = v.proxyMode;

  function compileProbeUrls(text: string) {
    return {
      proxyProbeUrls: text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  return (
    <SettingGroup
      title="出口代理"
      description="工作区 ECS 自动探测境外站点可达性，不通时经 Clash / 上游代理出口；无需维护逐个站点镜像"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
            {testing && <Spinner className="mr-2 size-4" />}
            测试配置
          </Button>
          <Button size="sm" type="submit" disabled={saving}>
            {saving && <Spinner className="mr-2 size-4" />}
            保存代理设置
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">代理模式</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Clash 需要订阅地址或粘贴配置；上游代理需提供一个 HTTP(S)/SOCKS5 出口
          </p>
        </div>
        <div className="shrink-0 sm:w-64">
          <Select
            value={mode}
            onValueChange={(m) => onChange({ proxyMode: m as typeof mode })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">直连（不启用代理）</SelectItem>
              <SelectItem value="clash">Clash (mihomo)</SelectItem>
              <SelectItem value="upstream">上游代理 (HTTP/SOCKS5)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "clash" && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">Clash 订阅地址</p>
            <Input
              value={v.proxyClashSubscription}
              onChange={(e) =>
                onChange({ proxyClashSubscription: e.target.value })
              }
              placeholder="https://example.com/sub?token=xxx"
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              启动时 ECS 拉取订阅生成配置；与下方「粘贴配置」二选一，如果已粘贴完整配置可留空。
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">Clash 配置（YAML，粘贴模式）</p>
            <Textarea
              rows={8}
              value={v.proxyClashYaml}
              onChange={(e) => onChange({ proxyClashYaml: e.target.value })}
              placeholder={
                "proxies:\n  - name: my-proxy\n    type: socks5\n    server: proxy.example.com\n    port: 1080\n"
              }
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              需要包含顶层 <code className="rounded bg-muted px-1">proxies:</code> 节点；不填时若提供订阅地址则自动生成。
            </p>
          </div>
        </>
      )}

      {mode === "upstream" && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">上游代理地址</p>
          <Input
            value={v.proxyUpstreamUrl}
            onChange={(e) => onChange({ proxyUpstreamUrl: e.target.value })}
            placeholder="http://host:port 或 socks5://host:port"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">用户名（可选）</p>
              <Input
                value={v.proxyUpstreamUsername}
                onChange={(e) => onChange({ proxyUpstreamUsername: e.target.value })}
                placeholder="username"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">密码（可选）</p>
              <Input
                type="password"
                value={v.proxyUpstreamSecret}
                onChange={(e) => onChange({ proxyUpstreamSecret: e.target.value })}
                placeholder={v.hasSavedSecret ? "已保存，留空不修改" : "password"}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">连通性探测地址</p>
          <Badge tone="gray">每行一个</Badge>
        </div>
        <Textarea
          rows={4}
          value={v.proxyProbeUrls.join("\n")}
          onChange={(e) => onChange(compileProbeUrls(e.target.value))}
          placeholder={"https://github.com\nhttps://registry-1.docker.io\nhttps://registry.npmjs.org"}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          全部可达则跳过代理直连；留空使用内置默认探测列表。
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">代理直通白名单 (no_proxy)</p>
          <Badge tone="gray">每行一个</Badge>
        </div>
        <Textarea
          rows={3}
          value={v.proxyBypass.join("\n")}
          onChange={(e) =>
            onChange({
              proxyBypass: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder={"127.0.0.1\nlocalhost\n.aliyuncs.com\n.cn"}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          不会经过代理的地址/域名后缀；默认已包含回环、阿里云内网与平台域名。
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Clash 内核下载回退地址（可选）</p>
        <Input
          value={v.clashBinUrl}
          onChange={(e) => onChange({ clashBinUrl: e.target.value })}
          placeholder="直接 URL（平台内置下载失败时使用）"
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          平台会自动从 <code className="rounded bg-muted px-1">/clash-linux-{"{amd64,arm64}"}</code> 分发内核，此地址作为兜底。
        </p>
      </div>
    </SettingGroup>
  );
}