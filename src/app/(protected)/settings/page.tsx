import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsForm } from "@/components/settings/settings-form";
import { ProxySettingsSection } from "@/components/settings/proxy-settings-section";
import { StorageSettings } from "@/components/settings/storage-settings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <SettingsForm />
      <ProxySettingsSection />
      <StorageSettings />
    </div>
  );
}