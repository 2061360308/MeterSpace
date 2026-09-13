/**
 * GET /api/launch-templates/[id]/download —— 把启动模板 payload 打包成 zip 下载。
 */
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { getLaunchTemplate } from "@/lib/launch-templates/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const t = await getLaunchTemplate(userId, id);
    if (!t) {
      const err = new Error("启动模板不存在") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    const zip = new JSZip();
    for (const f of t.payload) {
      zip.file(f.path, f.content, {
        unixPermissions: parseInt(f.mode, 8) || 0o644,
      });
    }
    zip.file(
      "template.json",
      JSON.stringify(t.definition, null, 2) + "\n",
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
        "content-disposition": `attachment; filename="${encodeURIComponent(t.definition.id)}.zip"`,
        "content-length": String(buf.length),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
