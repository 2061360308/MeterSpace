/**
 * GET /api/recipes/[id]/download —— 把当前 payload 打包成 zip 下载。
 *
 * 与上传（/api/recipes/upload）互为逆操作：下载 → 改 → 重新上传。
 */
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { getRecipe } from "@/lib/recipes/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const r = await getRecipe(userId, id);
    if (!r) {
      const err = new Error("配方不存在") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    const zip = new JSZip();
    for (const f of r.payload) {
      zip.file(f.path, f.content, {
        unixPermissions: parseInt(f.mode, 8) || 0o644,
      });
    }
    // 把元数据也打进 template.json 方便用户离线编辑
    zip.file(
      "template.json",
      JSON.stringify(r.definition, null, 2) + "\n",
    );

    const buf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      platform: "UNIX",
    });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${encodeURIComponent(r.definition.id)}.zip"`,
        "content-length": String(buf.length),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
