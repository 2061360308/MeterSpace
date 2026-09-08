"use client";

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FolderGit2 } from "lucide-react";
import { type StepProps } from "./types";

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
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auto-clone">自动拉取代码</Label>
          <p className="text-xs text-muted-foreground">
            开启后，工作区创建时将自动克隆指定仓库
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
        <div className="space-y-4 pt-4 border-t">
          {!state.gitAuthed ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FolderGit2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                需要授权 GitHub 以选择仓库
              </p>
              <a
                href="/api/git/auth?provider=github&returnTo=/workspaces/new"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <FolderGit2 className="h-4 w-4" />
                授权 GitHub
              </a>
            </div>
          ) : (
            <>
              <Field orientation="vertical">
                <FieldLabel htmlFor="git-repo">仓库</FieldLabel>
                <FieldContent>
                  <select
                    id="git-repo"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={state.gitRepoUrl}
                    onChange={(e) => {
                      const repo = state.repos.find(
                        (r) => r.fullName === e.target.value
                      );
                      setState((s) => ({
                        ...s,
                        gitRepoUrl: e.target.value,
                        gitBranch: repo?.defaultBranch ?? "main",
                      }));
                    }}
                  >
                    <option value="">不使用仓库</option>
                    {state.repos.map((repo) => (
                      <option key={repo.fullName} value={repo.fullName}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
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
                        默认分支: {selectedRepo.defaultBranch}
                      </FieldDescription>
                    )}
                  </FieldContent>
                </Field>
              )}
            </>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm">
          <span className="font-medium">已配置：</span>
          <span className="text-muted-foreground">
            {state.autoClone && state.gitRepoUrl
              ? `${state.gitRepoUrl} (${state.gitBranch})`
              : state.autoClone
              ? "等待选择仓库"
              : "不拉取代码"}
          </span>
        </p>
      </div>
    </div>
  );
}
