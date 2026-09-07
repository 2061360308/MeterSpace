import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { NewWorkspaceForm } from "@/components/workspaces/new-workspace-form";

export default async function NewWorkspacePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  if (!row) redirect("/setup");

  return <NewWorkspaceForm />;
}
