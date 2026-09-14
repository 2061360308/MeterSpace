import { RecipeList } from "@/components/recipes/recipe-list";
import { RegisterHeaderActions } from "@/components/header-actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload } from "lucide-react";

export default function RecipesPage() {
  return (
    <div className="space-y-6">
      <RegisterHeaderActions>
        <Button size="sm" asChild>
          <Link href="/recipes/upload">
            <Upload className="h-4 w-4" />
            上传 zip
          </Link>
        </Button>
      </RegisterHeaderActions>
      <RecipeList />
    </div>
  );
}
