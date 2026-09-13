import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsForm } from "@/components/settings/settings-form";
import { ProxySettingsSection } from "@/components/settings/proxy-settings-section";
import { StorageSettings } from "@/components/settings/storage-settings";
import { PageHeader } from "@/components/ui/page-header";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="这里的默认值会在新建工作区时自动带入，之后仍可逐个覆盖。"
      />
      <SettingsForm />
      <ProxySettingsSection />
      <StorageSettings />
    </div>
  );
}
