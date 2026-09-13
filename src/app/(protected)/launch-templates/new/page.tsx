/**
 * /launch-templates/new —— 新建启动模板的入口（v3 决定：单页路由 + 第 1 步二选一）。
 *
 * 第 1 步选「上传 zip」 → /launch-templates/new/upload
 * 第 1 步选「使用配方」 → /launch-templates/new/use
 */
import Link from "next/link";
import { ArrowRight, FilePlus2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";

export default function NewLaunchTemplatePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="新建启动模板"
        description="不含参数的可绑定对象；创建后即可在新建工作区时选择。"
      />

      <SectionHeader
        title="第 1 步 · 选方式"
        description="两种入口分别为独立路由，便于浏览器回溯与未来扩展。"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground">
              <FilePlus2 className="size-5" />
            </div>
            <div className="text-[14px] font-semibold">从 zip 上传</div>
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            你的代码已经写完、不含参数。在专业编辑器里打包后上传。
            注意：载荷不能含 <code className="rounded bg-muted px-1 py-0.5 font-mono">{"{{param_key}}"}</code> 占位符；含占位符系统会提示改去配方上传。
          </p>
          <Button asChild>
            <Link href="/launch-templates/new/upload">
              开始上传
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>

        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground">
              <Sparkles className="size-5" />
            </div>
            <div className="text-[14px] font-semibold">使用配方</div>
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            从内置或市场配方派生：选一份 → 填参数 → 系统渲染占位符 → 自动落为启动模板。
            适合「想填空不想写代码」的场景。
          </p>
          <Button asChild>
            <Link href="/launch-templates/new/use">
              去挑配方
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
