import { RecipeList } from "@/components/recipes/recipe-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Upload } from "lucide-react";

export default function RecipesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="配方"
        description="浏览内置与市场配方；点「使用配方」填好参数即可创建一个可绑定工作区的启动模板。"
        actions={
          <Button asChild>
            <Link href="/recipes/upload">
              <Upload className="h-4 w-4" />
              上传 zip
            </Link>
          </Button>
        }
      />
      <RecipeList />
    </div>
  );
}
