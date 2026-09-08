import { getMarketplaceImages, getMarketplaceFeatures } from "@/lib/marketplace/client";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const [images, features] = await Promise.all([
      getMarketplaceImages(),
      getMarketplaceFeatures(),
    ]);
    return ok({ images, features });
  } catch (e) {
    return fail(e);
  }
}
