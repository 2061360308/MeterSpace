import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { LaunchTemplateList } from "@/components/launch-templates/launch-template-list";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function LaunchTemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="启动模板"
        description="不含参数的可绑定对象；新建工作区时直接绑定。"
        actions={
          <Button asChild>
            <Link href="/launch-templates/new">
              <Plus className="h-4 w-4" />
              新建
            </Link>
          </Button>
        }
      />
      <LaunchTemplateList />
    </div>
  );
}
