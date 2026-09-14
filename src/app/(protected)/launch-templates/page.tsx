import { Button } from "@/components/ui/button";
import { RegisterHeaderActions } from "@/components/header-actions";
import { LaunchTemplateList } from "@/components/launch-templates/launch-template-list";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function LaunchTemplatesPage() {
  return (
    <div className="space-y-6">
      <RegisterHeaderActions>
        <Button size="sm" asChild>
          <Link href="/launch-templates/new">
            <Plus className="h-4 w-4" />
            新建
          </Link>
        </Button>
      </RegisterHeaderActions>
      <LaunchTemplateList />
    </div>
  );
}
