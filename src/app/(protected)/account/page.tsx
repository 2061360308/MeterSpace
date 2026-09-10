import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountForm } from "@/components/account/account-form";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">我的账号</h1>
        <p className="text-muted-foreground mt-1">
          管理绑定的云平台账号与安全设置
        </p>
      </div>
      <AccountForm />
    </div>
  );
}