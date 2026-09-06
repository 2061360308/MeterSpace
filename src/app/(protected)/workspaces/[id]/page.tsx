import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WorkspaceDetail } from "@/components/workspaces/workspace-detail";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <WorkspaceDetail id={params.id} />;
}
