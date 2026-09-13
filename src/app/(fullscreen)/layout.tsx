import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * 全屏路由组：绕过 `(protected)/AppShell` 的侧边栏与 max-w-[1200px]。
 * 仅用于单文件全屏编辑等需要横向满宽的场景（§4.4）。
 *
 * 鉴权：与 `(protected)/layout.tsx` 同一套（auth() → redirect /login）。
 */
export const metadata: Metadata = {
  title: "编辑模板文件 · MeterSpace",
};

export default async function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <div className="min-h-screen bg-background">{children}</div>;
}
