"use client";

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FolderGit2 } from "lucide-react";
import { type StepProps } from "./types";

/** Radix Select 不接受空字符串，用一个哨兵值表示「不使用仓库」 */
const NO_REPO = "__none__";

export function StepGit({ state, setState }: StepProps) {
  useEffect(() => {
    if (state.repos.length > 0 || state.gitAuthed) return;

    fetch("/api/git/repos?provider=github")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        setState((s) => ({
          ...s,
          repos: data.repos ?? [],
          gitAuthed: true,
        }));
      })
      .catch(() => {
        setState((s) => ({ ...s, gitAuthed: false }));
      });
  }, [state.repos.length, state.gitAuthed, setState]);

  const selectedRepo = state.repos.find((r) => r.fullName === state.gitRepoUrl);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="auto-clone" className="text-[13px] leading-6">
            自动拉取代码
          </Label>
          <p className="text-[12px] leading-5 text-muted-foreground">
            开启后，工作区创建时将自动克隆指定仓库。
          </p>
        </div>
        <Switch
          id="auto-clone"
          checked={state.autoClone}
          onCheckedChange={(checked) =>
            setState((s) => ({ ...s, autoClone: checked }))
          }
        />
      </div>

      {state.autoClone && (
        <div className="space-y-4 border-t border-border/70 pt-4">
          {!state.gitAuthed ? (
            <div className="rounded-lg bg-muted px-4 py-8 text-center">
              <FolderGit2 className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                需要授权 GitHub 才能列出你的仓库。
              </p>
              <Button asChild variant="outline" className="mt-4">
                <a href="/api/git/auth?provider=github&returnTo=/workspaces/new">
                  <FolderGit2 data-icon="inline-start" />
                  授权 GitHub
                </a>
              </Button>
            </div>
          ) : (
            <>
              <Field orientation="vertical">
                <FieldLabel htmlFor="git-repo">仓库</FieldLabel>
                <FieldContent>
                  <Select
                    value={state.gitRepoUrl || NO_REPO}
                    onValueChange={(v) => {
                      if (v === NO_REPO) {
                        setState((s) => ({ ...s, gitRepoUrl: "" }));
                        return;
                      }
                      const repo = state.repos.find((r) => r.fullName === v);
                      setState((s) => ({
                        ...s,
                        gitRepoUrl: v,
                        gitBranch: repo?.defaultBranch ?? "main",
                      }));
                    }}
                  >
                    <SelectTrigger id="git-repo" className="w-full">
                      <SelectValue placeholder="选择仓库" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_REPO}>不使用仓库</SelectItem>
                      {state.repos.map((repo) => (
                        <SelectItem key={repo.fullName} value={repo.fullName}>
                          {repo.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              {state.gitRepoUrl && (
                <Field orientation="vertical">
                  <FieldLabel htmlFor="git-branch">分支</FieldLabel>
                  <FieldContent>
                    <Input
                      id="git-branch"
                      value={state.gitBranch}
                      onChange={(e) =>
                        setState((s) => ({ ...s, gitBranch: e.target.value }))
                      }
                      placeholder="main"
                    />
                    {selectedRepo && (
                      <FieldDescription>
                        默认分支：{selectedRepo.defaultBranch}
                      </FieldDescription>
                    )}
                  </FieldContent>
                </Field>
              )}
            </>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted px-4 py-3 text-[13px] leading-6">
        <span className="font-medium">已配置：</span>
        <span className="text-muted-foreground">
          {state.autoClone && state.gitRepoUrl
            ? `${state.gitRepoUrl}（${state.gitBranch}）`
            : state.autoClone
            ? "等待选择仓库"
            : "不拉取代码"}
        </span>
      </div>
    </div>
  );
}
