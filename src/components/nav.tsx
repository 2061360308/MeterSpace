"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { clsx } from "@/lib/utils";
import { Button } from "@/components/ui";

const links = [
  { href: "/", label: "工作区" },
  { href: "/settings", label: "设置" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold">
            Workspace Cloud
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm",
                  pathname === l.href
                    ? "bg-gray-100 font-medium text-gray-900"
                    : "text-gray-600 hover:bg-gray-50",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          退出登录
        </Button>
      </div>
    </header>
  );
}
