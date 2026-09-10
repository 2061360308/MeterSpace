"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Network } from "lucide-react";
import { type StepProps } from "./types";

export function StepNetwork({ state, setState }: StepProps) {
  const mode = state.proxyMode;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4" />
            网络加速
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">代理模式</p>
            <Select
              value={mode}
              onValueChange={(v) =>
                setState((s) => ({ ...s, proxyMode: v as typeof mode }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">跟随全局设置</SelectItem>
                <SelectItem value="disabled">直连（不启用代理）</SelectItem>
                <SelectItem value="clash">Clash (mihomo)</SelectItem>
                <SelectItem value="upstream">上游代理 (HTTP/SOCKS5)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              ECS 会先直连探测境外站点，全部可达时自动直连，否则通过所选模式出口。
            </p>
          </div>

          {mode === "clash" && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium">Clash 订阅地址</p>
                <Input
                  value={state.proxyClashSubscription}
                  onChange={(e) =>
                    setState((s) => ({ ...s, proxyClashSubscription: e.target.value }))
                  }
                  placeholder="https://example.com/sub?token=xxx"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Clash 配置（YAML，可选）</p>
                <Textarea
                  rows={5}
                  value={state.proxyClashYaml}
                  onChange={(e) =>
                    setState((s) => ({ ...s, proxyClashYaml: e.target.value }))
                  }
                  placeholder={"proxies:\n  - name: my-proxy\n    type: socks5\n    ..."}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  留空时使用订阅地址自动生成；两者都提供时优先使用粘贴的配置。
                </p>
              </div>
            </div>
          )}

          {mode === "upstream" && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium">上游代理地址</p>
                <Input
                  value={state.proxyUpstreamUrl}
                  onChange={(e) =>
                    setState((s) => ({ ...s, proxyUpstreamUrl: e.target.value }))
                  }
                  placeholder="http://host:port 或 socks5://host:port"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">用户名（可选）</p>
                  <Input
                    value={state.proxyUpstreamUsername}
                    onChange={(e) =>
                      setState((s) => ({ ...s, proxyUpstreamUsername: e.target.value }))
                    }
                    placeholder="username"
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">密码（可选）</p>
                  <Input
                    type="password"
                    value={state.proxyUpstreamSecret}
                    onChange={(e) =>
                      setState((s) => ({ ...s, proxyUpstreamSecret: e.target.value }))
                    }
                    placeholder="password"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}