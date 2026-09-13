/**
 * POST /api/recipes/[id]/use —— 「使用配方」的核心动作。
 *
 * 输入：{ params: Record<string, unknown> }（key 形如填入后的值）
 * 输出：{ launchTemplateId }
 * 副作用：渲染 payload（替换 {{key}}）→ 创建 launch_templates 行
 *
 * 不创建 workspace；workspace 由 /api/launch-templates/[id]/instantiate 在用户
 * 完成参数填写后单独触发。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { getRecipe } from "@/lib/recipes/service";
import { buildParamValues } from "@/lib/templates/validate";
import { createLaunchFromRecipe } from "@/lib/launch-templates/service";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  params: z.record(z.string(), z.unknown()).default({}),
  /** 可选：覆盖生成出的 launch_template id / name（默认继承 recipe） */
  overrideId: z.string().optional(),
  overrideName: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const recipe = await getRecipe(userId, id);
    if (!recipe) {
      const err = new Error("配方不存在") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    // 1. 校验 + 补齐 params
    const vars = buildParamValues(recipe.definition.params, body.params);

    // 2. 生成 launch_template id（若重名了用 recipe.id-时间戳）
    const launchId = body.overrideId ?? `${recipe.definition.id}-${Date.now().toString(36)}`;
    const launchName = body.overrideName ?? recipe.definition.name;

    // 3. 渲染 + 落 launch_templates
    const saved = await createLaunchFromRecipe(
      userId,
      recipe,
      vars,
      { id: launchId, name: launchName },
    );

    return ok(
      {
        launchTemplateId: saved.definition.id,
        originRecipeId: saved.originRecipeId,
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
