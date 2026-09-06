import { listFeatures } from "@/lib/features";
import { ok } from "@/lib/api";

export async function GET() {
  return ok({ features: listFeatures() });
}
