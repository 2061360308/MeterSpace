import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountForm } from "@/components/account/account-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        title="我的账号"
        description="管理绑定的云平台账号与安全设置。"
      />
      <AccountForm />
    </div>
  );
}
