import { TemplateList } from "@/components/templates/template-list";

export default function TemplatesPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">模板市场</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选择一个模板快速创建开发环境。内置模板开箱即用，也支持你自己的模板。
        </p>
      </div>
      <TemplateList />
    </div>
  );
}
