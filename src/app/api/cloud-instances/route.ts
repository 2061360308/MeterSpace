import { NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cloudInstances, instanceCache } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.string().default("aliyun"),
  region: z.string().min(1),
  instanceType: z.string().min(1),
  cpuCoreCount: z.number().int().nonnegative().nullable().optional(),
  memorySize: z.number().nonnegative().nullable().optional(),
  instanceTypeFamily: z.string().nullable().optional(),
  cpuArchitecture: z.string().nullable().optional(),
  gpuCount: z.number().int().nonnegative().nullable().optional(),
  gpuSpec: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");
    const provider = searchParams.get("provider");

    const conditions = [eq(cloudInstances.userId, userId)];
    if (region) {
      conditions.push(eq(cloudInstances.region, region));
    }
    if (provider) {
      conditions.push(eq(cloudInstances.provider, provider));
    }

    const list = await db
      .select()
      .from(cloudInstances)
      .where(and(...conditions))
      .orderBy(desc(cloudInstances.createdAt));

    // 新行规格元数据已落库，直接返回；仅对缺省（存量）行按需从
    // instance_cache（24h TTL）按 (provider, region, instanceType) 补齐，
    // 仍未命中时保持 null，前端显示「—」
    const missingSpec = list.filter((r) => r.cpuCoreCount == null && r.memorySize == null);
    const groups = new Map<string, { provider: string; region: string; types: string[] }>();
    for (const row of missingSpec) {
      const key = `${row.provider}|${row.region}`;
      const g = groups.get(key);
      if (g) {
        g.types.push(row.instanceType);
      } else {
        groups.set(key, { provider: row.provider, region: row.region, types: [row.instanceType] });
      }
    }

    const specMap = new Map<
      string,
      {
        cpuCoreCount: number;
        memorySize: number;
        instanceTypeFamily: string | null;
        cpuArchitecture: string | null;
        gpuCount: number | null;
        gpuSpec: string | null;
      }
    >();
    for (const g of groups.values()) {
      const cached = await db
        .select({
          instanceType: instanceCache.instanceType,
          cpuCoreCount: instanceCache.cpuCoreCount,
          memorySize: instanceCache.memorySize,
          instanceTypeFamily: instanceCache.instanceTypeFamily,
          cpuArchitecture: instanceCache.cpuArchitecture,
          gpuCount: instanceCache.gpuCount,
          gpuSpec: instanceCache.gpuSpec,
        })
        .from(instanceCache)
        .where(
          and(
            eq(instanceCache.provider, g.provider),
            eq(instanceCache.region, g.region),
            inArray(instanceCache.instanceType, g.types),
          ),
        );
      for (const c of cached) {
        specMap.set(`${g.provider}|${g.region}|${c.instanceType}`, {
          cpuCoreCount: c.cpuCoreCount,
          memorySize: c.memorySize,
          instanceTypeFamily: c.instanceTypeFamily,
          cpuArchitecture: c.cpuArchitecture,
          gpuCount: c.gpuCount,
          gpuSpec: c.gpuSpec,
        });
      }
    }

    const instances = list.map((row) => {
      if (row.cpuCoreCount != null || row.memorySize != null) return row;
      const spec = specMap.get(`${row.provider}|${row.region}|${row.instanceType}`);
      if (!spec) return row;
      return {
        ...row,
        cpuCoreCount: spec.cpuCoreCount,
        memorySize: spec.memorySize,
        instanceTypeFamily: spec.instanceTypeFamily,
        cpuArchitecture: spec.cpuArchitecture,
        gpuCount: spec.gpuCount,
        gpuSpec: spec.gpuSpec,
      };
    });

    return ok({ instances });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());
    const [created] = await db
      .insert(cloudInstances)
      .values({
        ...body,
        userId,
        cpuCoreCount: body.cpuCoreCount ?? null,
        memorySize: body.memorySize ?? null,
        instanceTypeFamily: body.instanceTypeFamily ?? null,
        cpuArchitecture: body.cpuArchitecture ?? null,
        gpuCount: body.gpuCount ?? null,
        gpuSpec: body.gpuSpec ?? null,
      })
      .returning();
    return ok(created, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
