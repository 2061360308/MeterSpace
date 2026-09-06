import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { SetupForm } from "@/components/setup/setup-form";

export default async function SetupPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  if (row) redirect("/");

  return (
    <div className="mx-auto max-w-2xl">
      <SetupForm />
    </div>
  );
}
