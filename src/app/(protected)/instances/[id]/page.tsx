import { requireUserId } from "@/lib/session";
import { InstanceDetail } from "@/components/instances/instance-detail";

type Params = { params: Promise<{ id: string }> };

export default async function InstancePage({ params }: Params) {
  await requireUserId();
  const { id } = await params;
  return <InstanceDetail id={id} />;
}
