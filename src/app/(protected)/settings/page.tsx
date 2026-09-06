import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsForm />
    </div>
  );
}
