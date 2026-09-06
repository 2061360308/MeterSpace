import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-center text-2xl font-semibold">Workspace Cloud</h1>
        <p className="mb-6 mt-1 text-center text-sm text-gray-500">
          云端开发环境
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </Card>
    </main>
  );
}
