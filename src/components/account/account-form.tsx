"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Cloud,
  GitBranch,
  GitFork,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Unlink,
} from "lucide-react";

interface GitTokenInfo {
  provider: string;
  username: string | null;
  updatedAt: string | null;
}

interface AccountCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}

function AccountCard({ icon, title, description, badge, children }: AccountCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {badge}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AccountForm() {
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [aliBound, setAliBound] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [gitTokens, setGitTokens] = useState<GitTokenInfo[]>([]);
  const [gitLoading, setGitLoading] = useState(true);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [savingAli, setSavingAli] = useState(false);
  const [testingAli, setTestingAli] = useState(false);
  const [disconnectingGit, setDisconnectingGit] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()).catch(() => null),
      fetch("/api/account/balance").then((r) => r.json()).catch(() => null),
      fetch("/api/git/token").then((r) => r.json()).catch(() => ({ tokens: [] })),
    ]).then(([s, b, g]) => {
      if (s?.settings) {
        if (s.settings.accessKeyId) {
          setAccessKeyId(s.settings.accessKeyId);
          setAliBound(true);
        }
      }
      if (b?.availableAmount != null) setBalance(b.availableAmount);
      if (Array.isArray(g?.tokens)) setGitTokens(g.tokens);
      setLoaded(true);
      setGitLoading(false);
    });
  }, []);

  const githubToken = gitTokens.find((t) => t.provider === "github");

  const saveAliyun = async () => {
    if (!accessKeyId.trim()) {
      toast.error("请填写 AccessKey ID");
      return;
    }
    setSavingAli(true);
    try {
      const body: Record<string, unknown> = { accessKeyId: accessKeyId.trim() };
      if (accessKeySecret) body.accessKeySecret = accessKeySecret;
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存失败");
      }
      setAccessKeySecret("");
      setAliBound(true);
      toast.success("阿里云凭据已保存");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingAli(false);
    }
  };

  const testConnection = async () => {
    if (!accessKeyId.trim() || !accessKeySecret.trim()) {
      toast.error("请先填写 AccessKey ID 和 Secret 再测试");
      return;
    }
    setTestingAli(true);
    try {
      const res = await fetch("/api/account/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: accessKeyId.trim(),
          accessKeySecret: accessKeySecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "连接失败");
      setBalance(data.balance?.availableAmount ?? balance);
      toast.success("连接成功，余额可用");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingAli(false);
    }
  };

  const disconnectGitHub = async () => {
    setDisconnectingGit(true);
    try {
      const res = await fetch("/api/git/token?provider=github", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("断开失败");
      setGitTokens((prev) => prev.filter((t) => t.provider !== "github"));
      toast.success("已断开 GitHub 连接");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDisconnectingGit(false);
    }
  };

  const changePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.error("请填写旧密码和新密码");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("新密码至少 6 位");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "修改失败");
      setOldPassword("");
      setNewPassword("");
      toast.success("密码已修改");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPassword(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountCard
        icon={<Cloud className="size-5" />}
        title="阿里云"
        description="用于创建和管理云工作区实例"
        badge={
          aliBound ? <Badge tone="green">已绑定</Badge> : <Badge tone="gray">未绑定</Badge>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>AccessKey ID</Label>
            <Input
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              placeholder="LTAI5t..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>AccessKey Secret{accessKeyId && "（留空保持不变）"}</Label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={accessKeySecret}
                onChange={(e) => setAccessKeySecret(e.target.value)}
                placeholder="不修改请留空"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            当前余额: <span className="font-medium text-foreground">{formatCurrency(balance)}</span>
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testingAli}
            >
              {testingAli ? (
                <Spinner className="mr-2 size-4" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              测试连接
            </Button>
            <Button onClick={saveAliyun} disabled={savingAli}>
              {savingAli && <Spinner className="mr-2 size-4" />}
              保存凭据
            </Button>
          </div>
        </div>
      </AccountCard>

      <AccountCard
        icon={<GitBranch className="size-5" />}
        title="GitHub"
        description="用于在工作区中克隆代码仓库"
        badge={
          githubToken ? (
            <Badge tone="green">已绑定</Badge>
          ) : (
            <Badge tone="gray">未绑定</Badge>
          )
        }
      >
        {gitLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : githubToken ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm">
              已连接账号:
              <span className="ml-1 font-medium text-foreground">
                @{githubToken.username ?? "未知"}
              </span>
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                onClick={disconnectGitHub}
                disabled={disconnectingGit}
              >
                {disconnectingGit ? (
                  <Spinner className="mr-2 size-4" />
                ) : (
                  <Unlink className="mr-2 size-4" />
                )}
                断开连接
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              连接 GitHub 后可在创建工作区时选择仓库
            </p>
            <Button asChild className="ml-auto">
              <Link href="/api/git/auth?provider=github&returnTo=/account">
                <GitFork className="mr-2 size-4" />
                连接 GitHub
              </Link>
            </Button>
          </div>
        )}
      </AccountCard>

      <AccountCard
        icon={<GitFork className="size-5" />}
        title="腾讯云"
        description="腾讯云账号接入即将支持"
        badge={<Badge tone="gray">未绑定</Badge>}
      >
        <p className="text-sm text-muted-foreground">
          腾讯云支持正在开发中，敬请期待。
        </p>
      </AccountCard>

      <AccountCard
        icon={<Cloud className="size-5" />}
        title="AWS"
        description="AWS 账号接入即将支持"
        badge={<Badge tone="gray">未绑定</Badge>}
      >
        <p className="text-sm text-muted-foreground">
          AWS 支持正在开发中，敬请期待。
        </p>
      </AccountCard>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lock className="size-5" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">登录密码</CardTitle>
              <CardDescription>修改 MeterSpace 账号的登录密码</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>旧密码</Label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入当前密码"
              />
            </div>
            <div className="space-y-1.5">
              <Label>新密码</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={changePassword} disabled={savingPassword}>
            {savingPassword && <Spinner className="mr-2 size-4" />}
            修改密码
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}