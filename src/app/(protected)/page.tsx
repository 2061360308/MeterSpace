import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { BalanceCard } from "@/components/balance-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FolderCode } from "lucide-react";

export default async function OverviewPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  if (!row) redirect("/setup");

  return (
    <div>
      <PageHeader
        title="概览"
        description="账户与工作区状态一览。"
        actions={
          <Link href="/workspaces/new">
            <Button>
              <FolderCode className="size-4" />
              新建工作区
            </Button>
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BalanceCard />
      </div>
    </div>
  );
}
