import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspacePayloads } from "@/lib/db/schema";
import { verifyAccessTokenWithInstance } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";
import type { PayloadResponse, PayloadFile } from "@/lib/templates/types";

type Params = { params: Promise<{ id: string }> };

/** 落盘根目录（agent 侧与 entrypoint 约定，见 §6.1）。 */
const WORKSPACE_ROOT = "/opt/ws";

/**
 * GET /api/instances/[id]/payload —— agent 拉载荷文件数组（§9.2）。
 *
 * 鉴权：Authorization: Bearer <agent_token>
 * 兼容旧写法：?token=<token>
 *
 * 响应里 `vars` 目前留空对象（参数已在后端渲染进文件内容，§4.1）；
 * 保留字段是为了后续需要把原始参数值透给脚本（如写 .env）时不必改协议。
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const auth = req.headers.get("authorization") ?? "";
    let token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!token) {
      token = req.nextUrl.searchParams.get("token") ?? "";
    }
    if (!token) {
      return fail({ message: "Missing token", status: 401 });
    }

    const { valid, instance } = await verifyAccessTokenWithInstance(id, token);
    if (!valid || !instance) {
      return fail({ message: "Invalid token", status: 401 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, instance.workspaceId),
    });
    if (!workspace) {
      return fail({ message: "Workspace not found", status: 404 });
    }

    const rows = await db
      .select()
      .from(workspacePayloads)
      .where(eq(workspacePayloads.workspaceId, workspace.id));

    const files: PayloadFile[] = rows
      .map((r) => ({
        path: r.path,
        content: r.content,
        mode: r.mode,
        size: r.size,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const entry = workspace.entry ?? "";
    if (!entry) {
      return fail({
        message: "工作区未绑定 entry（非模板工作区？）",
        status: 409,
      });
    }

    if (files.length === 0) {
      return fail({ message: "工作区载荷为空", status: 409 });
    }

    if (!files.some((f) => f.path === entry)) {
      return fail({
        message: `载荷中缺少 entry 文件: ${entry}`,
        status: 409,
      });
    }

    const payload: PayloadResponse = {
      entry,
      workspace: WORKSPACE_ROOT,
      vars: {},
      files,
    };

    return ok(payload);
  } catch (e) {
    return fail(e);
  }
}
