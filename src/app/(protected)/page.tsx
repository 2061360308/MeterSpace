import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { WorkspaceList } from "@/components/workspaces/workspace-list";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  if (!row) redirect("/setup");

  return <WorkspaceList />;
}
