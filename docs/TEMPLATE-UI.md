# 模板与启动模式 UI 对齐方案

> 权威: `docs/FINAL-PLAN.md` §9 / §10 ｜ 视觉语言: Vercel / Geist （[设计原文](https://fchangjun.github.io/awesome-design-md-cn/design-md/vercel/DESIGN.md) → 本地落地: `docs/UI-PERFORMANCE.md` v1.1）  
> 状态: **Phase A–F 全部落地（2026-09-12）+ 启动模板改造（2026-09-12，见 §10）+ 配方 vs 模板 + 全屏编辑器（2026-09-12，见 §11、§12）**；tsc 0 error / lint 0 error / build 58 页全过（含新 `/templates/[id]/edit`） ｜ 工期: 见 §6 预算表

---

## 0. 现状盘点与缺口矩阵

| 层                        | 现状                                                                                                                    | 缺口 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -- |
| 后端协议                     | `lib/templates/{client,service,validate,zip,builtin,render,types}.ts`                                                 | —  |
| 后端 API                   | `GET /api/templates`, `GET /api/templates/[id]`, `POST /api/templates/upload`, `POST /api/templates/[id]/instantiate` | —  |
| DB                       | 迁移 0014 已应用（`templates`, `workspace_payloads`, `workspaces.template_id`）                                              | —  |
| 内置模板                     | `BUILTIN_TEMPLATES`: `compose-app`, `database`, `devcontainer-node`, `sh-shell`                                       | —  |
| 侧边栏 `/templates` 入口      | 无                                                                                                                     | G1 |
| 市场 `features` / `images` | 已下线（A 方案）                                                                                                             | —  |
| `/templates` 列表          | 仅展示，无新建/上传入口                                                                                                          | G2 |
| `/templates/[id]` 文件 tab | 纯 Textarea                                                                                                            | G4 |
| 实例化对话框                   | 无 zip 上传；`params` 表单未前端化                                                                                              | G5 |
| 轻量代码编辑器                  | 无                                                                                                                     | G6 |

### 本计划交付物

| #  | 名称                                                                | 解除缺口   |
| -- | ----------------------------------------------------------------- | ------ |
| D1 | 侧边栏接入 `/templates`                                                | G1     |
| D2 | `/templates` 新建/上传入口                                              | G2     |
| D3 | 文件 tab = 平面 Table 清单 + 单文件全屏编辑路由 `/templates/[id]/edit/[...path]` | G4, G6 |
| D4 | 实例化对话框三步表单                                                        | G5     |

---

## 1. 视觉与组件基础

| 规格                                                                                           | 来源                                                      | 适用范围              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| `--shadow-border`, `--shadow-card`, `--shadow-card-hover`, `--shadow-elevated`               | `globals.css`                                           | 所有卡片、按钮、边框        |
| 圆角 4 / 6 / 8 px 三档                                                                           | `globals.css`                                           | 所有组件              |
| 字重严格 400 / 500 / 600                                                                         | `globals.css`                                           | 所有文本              |
| 中文：字距归零、body 14px、line-height 1.7、字体栈 PingFang SC → Microsoft YaHei → Noto Sans SC、数字 `tnum` | `globals.css`                                           | `body`, `p`, `td` |
| 页面通用件                                                                                        | `ui/page-header.tsx`, `ui/error.tsx`, `ui/skeleton.tsx` | 所有页面              |
| 按钮主色 `#0072f5`、次按钮 outline 用 `shadow-border`                                                 | `globals.css` + shadcn                                  | 所有 CTA            |
| 加载态                                                                                          | 骨架屏扫光（`ui/skeleton.tsx`）                                | 异步边界              |

---

## 2. `CodeEditor` 组件

### 2.1 规格

| 维度 | 值 |
|---|---|
| 实现 | `@uiw/react-codemirror`（CodeMirror 6） |
| 包大小 gz | ~150 KB |
| 主题 | 全部走 CSS 变量（§2.4） |
| 语言支持 | 全部模板文件类型（§2.2 映射） |

### 2.2 后缀 → 语言映射

实现位置: `src/lib/ui/lang-detect.ts`，导出 `detect(filename: string): EditorLanguage`。

| 输入                     | 语言           |
| ---------------------- | ------------ |
| `.sh`, `.bash`, `.zsh` | `shell`      |
| `.json`                | `json`       |
| `.yml`, `.yaml`        | `yaml`       |
| `Dockerfile`（文件名完全匹配）  | `dockerfile` |
| `.ts`, `.tsx`          | `typescript` |
| `.js`, `.jsx`          | `javascript` |
| `.md`                  | `markdown`   |
| `.env` 及其它             | `plaintext`  |

### 2.3 安装

```bash
npm i @uiw/react-codemirror \
  @codemirror/lang-json @codemirror/lang-yaml @codemirror/lang-javascript \
  @codemirror/lang-markdown @codemirror/legacy-modes \
  @codemirror/language @codemirror/view @codemirror/state \
  @codemirror/commands @codemirror/language-data @codemirror/autocomplete
```

> 包名实测校正：`@codemirror/lang-dockerfile` 在 npm registry **不存在**；dockerfile 与 shell 通过 `@codemirror/legacy-modes/mode/{dockerfile,shell}` 装载（`dockerFile` 是驼峰导出名）。
> `keymap` 从 `@uiw/react-codemirror` 或 `@codemirror/view` 取，**不从** `@codemirror/commands`（commands 包的 keybinding 是已经预制好的命令，不含 keymap 工厂）。

### 2.4 主题：通过 CSS 变量绑定

```ts
EditorView.theme({
  "&":             { color: "var(--foreground)", backgroundColor: "transparent" },
  ".cm-content":   { caretColor: "var(--foreground)" },
  ".cm-focused .cm-cursor": { borderLeftColor: "var(--ring)" },
  ".cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--muted)",
  },
  ".cm-gutters":    { backgroundColor: "transparent", color: "var(--muted-foreground)",
                      borderRight: "0 0 0 1px rgb(0 0 0 / 0.06)" },
  ".cm-activeLine": { backgroundColor: "var(--muted)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
}, { dark: false })
```

Token 色由各语言包提供；Phase A 末轮做与 Geist 的色温对齐。

### 2.5 组件 API（`src/components/ui/code-editor.tsx`）

| Prop        | 类型                                                                                                         | 默认值     | 必填 |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------- | -- |
| `value`     | `string`                                                                                                   | —       | 是  |
| `onChange`  | `(v: string) => void`                                                                                      | —       | 是  |
| `language`  | `"json" \| "yaml" \| "shell" \| "dockerfile" \| "javascript" \| "typescript" \| "markdown" \| "plaintext"` | —       | 是  |
| `readOnly`  | `boolean`                                                                                                  | `false` | 否  |
| `minHeight` | `number`                                                                                                   | `320`   | 否  |
| `className` | `string`                                                                                                   | —       | 否  |
| `onSave`    | `() => void`                                                                                               | —       | 否  |

行为表:

| 触发                | 行为                |
| ----------------- | ----------------- |
| 编辑器中 `Cmd/Ctrl+S` | 调用 `onSave()`     |
| `onChange`        | 立即同步调用，不 debounce |

---

## 3. 侧边栏结构

`src/components/app-sidebar.tsx` 的 `navGroups`:

| 组    | 项                          | 图标                      |
| ---- | -------------------------- | ----------------------- |
| 工作区  | 概览, 工作区, 弹性规格              | 沿用                      |
| 资源管理 | **模板市场**, 镜像, Features, 脚本 | `LayoutTemplate`（仅模板市场） |
| 设置   | 通用, 环境变量, API 密钥           | 沿用                      |

变更:

| 路径                               | 变更                                                    |
| -------------------------------- | ----------------------------------------------------- |
| `src/components/app-sidebar.tsx` | 删除 `其他` 组（Playground 是死链）；`资源管理` 首项加 `模板市场`；新增 `设置` 组 |

---

## 4. 页面规格

### 4.1 `/templates`（列表）

| 区域                       | 内容                                         |
| ------------------------ | ------------------------------------------ |
| `PageHeader` title       | `模板市场`                                     |
| `PageHeader` description | `预制配方 + 你的私有模板，开箱即用`                       |
| 主操作                      | `上传 zip` 按钮（主按钮 + Upload 图标）               |
| 次操作                      | `新建模板` 按钮（outline，链 `/templates/new`）      |
| 筛选条                      | `[search input] [全部] [Web] [数据库] [运维] ...` |
| 网格                       | 3 列 xl / 2 列 md / 1 列 sm                   |
| 卡片                       | 沿用 `TemplateCard`，加来源药丸 `内置` / `我的` / `市场` |

按钮行为:

| 触发       | 行为                                                                                         |
| -------- | ------------------------------------------------------------------------------------------ |
| `上传 zip` | 文件选择器（`accept=".zip"`）；成功 `router.push('/templates/<id>')`；失败 `APIError(apiError.message)` |
| `新建模板`   | `router.push('/templates/new')`（Phase F）                                                   |

空态（`templates.length === 0`）:

| 字段    | 内容                             |
| ----- | ------------------------------ |
| title | `还没有模板`                        |
| body  | `内置模板应该已自动出现。如果没有，可能是网络或服务异常。` |
| 主 CTA | `上传第一个 zip`                    |
| 次 CTA | `去模板市场`（本页面禁用）                 |

### 4.2 `/templates/[id]/edit`（全屏模板编辑器）

> 单路由、双 Tab（**元数据 / 文件**）的统一编辑器；配方只读、模板可写。
> 全屏布局走 `(fullscreen)` 路由组，绕过 `(protected)/AppShell` 节省宽度。

路由声明:

| 项 | 规格 |
| --- | --- |
| 文件路径 | `app/(fullscreen)/templates/[id]/edit/page.tsx` |
| 布局组 | `(fullscreen)`（与 `(protected)` 平级，非嵌套） |
| 鉴权 | 复用 `(fullscreen)/layout.tsx` 的 `auth()` + redirect `/login` |

顶栏（`h-14 border-b bg-background`）:

| 槽位 | 内容 |
| --- | --- |
| 左 | `←` 返回（user → `/launch-templates`；非 user → `/templates`）+ 模板名 + id + 来源药丸（内置 / 市场 / 我的） + 只读药丸（配方时） |
| 中 | Tabs: `[元数据] [文件]` |
| 右 | 「保存」按钮（user-only；元数据 Tab 存元数据，文件 Tab 存当前选中文件）+ 「更多」下拉（下载 zip / 删除模板，user-only 才有删除） |

**元数据 Tab**：

| 节 | 字段 |
| --- | --- |
| 基础信息 | 名称、描述、分类、入口文件（select）、标签、超时秒数 |
| 参数 | 每项 Param：key / label / 类型 / 默认值 / placeholder / options（select 时），可增删；空时显示「配方是完全固定的，工作区使用时无需再填表」 |
| 端口 | port / label / protocol / private；可增删 |

| Tab 行为 | 详情 |
| --- | --- |
| dirty 提示 | 元数据改动后顶部显示「有未保存的修改」+ amber 提示 |
| 配方只读 | 全部 `disabled={true}`，保存按钮 / 更多下拉的删除项隐藏 |
| 保存 | 走 `POST /api/templates` 全量 upsert（含所有当前文件值） |
| Cmd/Ctrl+S | 在元数据 Tab 触发元数据保存（readonly 时不响应） |

**文件 Tab**（目录树 + 编辑器，IDE 风）:

| 区 | 内容 |
| --- | --- |
| 左 260px | 目录树组件 `DirectoryTree`：路径段按 `/` 拆，文件夹展开/折叠 + 折叠箭头 + Folder/FolderOpen/File 图标；未保存文件右侧 amber dot；点击选中 |
| 右 自适应 | 文件头（40px 高）：路径面包屑（每段可点击向上跳）+ 语言药丸 + 未保存 dot；下方 CodeEditor 占满高度 |

| 触发 | 行为 |
| --- | --- |
| 点击文件 | 切换选中，加载内容到 CodeEditor |
| 编辑内容 | `setFileValues` 标 dirty；顶部「未保存」+ 文件名 amber dot 出现 |
| Cmd/Ctrl+S / 「保存」 | `POST /api/templates/[id]` `{files: [{path, content}]}` 增量合并（§4.4 后端契约） |
| 配方只读 | CodeMirror `readOnly={true}`；保存按钮禁用 |

实现要点：

| 项 | 规格 |
| --- | --- |
| 目录树构建 | `DirectoryTree.buildTree(files)`：按 `/` 切段，递归构嵌套对象；排序：文件夹优先，字母升序；默认全部展开 |
| 文件元数据保存 | `POST /api/templates` 全量 upsert（保留所有当前文件 dirty 值，避免覆盖未保存编辑） |
| 单文件保存 | `POST /api/templates/[id]` 增量合并（按 path，§4.4 契约） |
| beforeunload | dirty 时浏览器原生确认（meta 或 file 任一 dirty 即拦截） |

### 4.4 单文件编辑路由（已弃用，2026-09-12）

原 `/templates/[id]/edit/[...path]` 单文件全屏编辑器已废弃——目录树 + 编辑器覆盖了所有单文件编辑场景；深链语义也不再需要。
历史契约参见 git 历史；新代码统一走 §4.2 的 `/templates/[id]/edit`。

### 4.5 实例化入口（已迁移，2026-09-12）

模板「使用模板」入口已从模板列表页删除。原 Phase E 实例化对话框（三步：基础 → 参数 → 确认）整体迁到 `wizard /workspaces/new`，详见 `docs/FINAL-PLAN.md` §9 工作区向导。

**wizard 第 3 步**：标题「模板」，列表只取 `source === user`；选中含 params 的模板时渲染 `ParamField`；提交走 `POST /api/templates/[id]/instantiate`（扩展支持 git / 代理 / OSS bucket 初始化，与 `createWorkspace` 对齐）。

### 4.6 `/templates/new`

三张卡: `from-blank`、`from-builtin`、`from-zip`。点击各跳对应路径或处理：
- **从空白**：`POST /api/templates` 创建最小配方（id `blank-<ts><rand>`，entry `run.sh`），跳 `/templates/<id>/edit` 继续完善
- **从内置复制**：跳 `/templates` 配方页挑一份 fork 过来（直接跳列表）
- **从 zip 上传**：选文件 → `POST /api/templates/upload` → 跳 `/templates/<id>/edit`

---

## 5. 交互细节

### 5.1 上传 zip

| 项     | 规格                                        |
| ----- | ----------------------------------------- |
| 前端体积门 | <2 MB 静默；2–10 MB 警告（允许）；>10 MB 阻断 + toast |
| 进度 UI | 按钮 spinner（不实现 `XHR.upload.onprogress`）   |
| 服务端错误 | 通过 `apiError.message` 渲染 `APIError`       |

### 5.2 编辑路由保存

| 项          | 规格                                                   |
| ---------- | ---------------------------------------------------- |
| 触发         | 顶栏 `保存` 或 `Cmd/Ctrl+S`                               |
| 增量 payload | `{ files: [{ path, content }] }`；服务端按 `path` 合入      |
| dirty 生命周期 | `onChange` → `true`；保存成功 → `false`                   |
| 未保存提示      | `beforeunload`（浏览器原生）+ 路由跳转拦截                        |
| 只读分支       | `template.source === 'builtin'` 隐藏 `保存`、置 `readOnly` |

### 5.3 语言检测兜底

`lang-detect.ts` 返回 `plaintext` → 编辑器纯文本 + monospace + 行号；不抛错。

---

## 6. 实施分阶段

### 阶段依赖图

| 顺序 | 阶段        |
| -- | --------- |
| 第一 | A         |
| 第二 | B         |
| 第三 | C, D（并行）  |
| 第四 | E         |
| 最后 | F（独立，可前置） |

### 阶段预算

| 阶段               | 人日   |
| ---------------- | ---- |
| A 编辑器 + 主题       | 0.5  |
| B 文件清单 + 全屏路由    | 0.75 |
| C 列表页入口          | 0.25 |
| D 下载端点           | 0.25 |
| E 实例化对话框         | 0.5  |
| F 侧边栏 + 新建引导（可选） | 0.25 |
| 合计               | 2.5  |

### Phase A：编辑器 + 主题（0.5 人日） — ✅ 已落地（2026-09-12）

| 步 | 文件 / 命令                                      | 验证                                                  |
| - | -------------------------------------------- | --------------------------------------------------- |
| 1 | `npm i <§2.3 列表>` | 55 包安装成功，`package.json` 已写入 |
| 2 | 新建 `src/components/ui/code-editor.tsx`（§2.5） | 导入编译通过                                              |
| 3 | 视情况调整 `globals.css` 的语言 token 色              | 手动目视                                                |
| 4 | Demo 路由 `app/(protected)/_dev/code-editor-demo/page.tsx` | 8 语言 + 只读 + Cmd/Ctrl+S 三组样品 |

验收:

| 项                      | 通过条件               |
| ---------------------- | ------------------ |
| shell / yaml / json 高亮 | demo 页目视确认 |
| 焦点态                    | caret 用 `--ring` 色（theme 用 var） |
| 只读                                 | demo 页有只读样品 + `readOnly={true}` 隐藏 caret |
| 嵌套路径 json 高亮（`.devcontainer/...json`） | demo 页包含该样品            |
| 语言兜底（`weird.xyz` → plaintext）        | demo 页包含该样品            |
| Cmd/Ctrl+S 保存                     | demo 页有计数器             |
| tsc                                | 0 error                  |
| lint                               | 0 warning / error        |
| lang-detect 单元测试                     | 10/10 用例通过（tsx 跑测）    |

> 第 4 步 demo 路由（`app/(protected)/_dev/code-editor-demo/`）仅供验证；可以保留或随 Phase F 后删除。

### Phase B：文件清单 + 全屏编辑路由（0.75 人日）

| 步 | 文件                                                        | 变更                                                                              |
| - | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1 | `src/lib/ui/lang-detect.ts`                               | `detect(filename)` 按 §2.2 表                                                     |
| 2 | `app/(protected)/templates/[id]/page.tsx` 文件 tab          | 重写为 §4.3 Table                                                                  |
| 3 | 同上                                                        | 加 4 顶栏动作                                                                        |
| 4 | 同上                                                        | 整行 `<Link>`；hover 删除；新建文件 Dialog                                                |
| 5 | `app/(fullscreen)/layout.tsx`                             | 新建：`<html><body>{children}</body></html>` + globals.css                         |
| 6 | `app/(fullscreen)/templates/[id]/edit/[...path]/page.tsx` | 按 §4.4 规格：顶栏、`next/dynamic` CodeMirror、Cmd/Ctrl+S、dirty、beforeunload、builtin 只读 |
| 7 | `src/lib/templates/service.ts`                            | 按 `path` 合入 `files[]`（若现状是全量替换则改）                                               |


验收见 §7。

### Phase C：列表页入口（0.25 人日）

| 步 | 文件                                   | 变更                                                     |
| - | ------------------------------------ | ------------------------------------------------------ |
| 1 | `app/(protected)/templates/page.tsx` | 加 `上传 zip`（主）+ `新建模板`（次 → `/templates/new`）            |
| 2 | 同上                                   | `上传 zip` 触发文件选择器；成功 → `router.push('/templates/<id>')` |
| 3 | 同上                                   | 空态文案                                                   |

验收:

| 项             | 通过条件        |
| ------------- | ----------- |
| 上传 zip → 跳编辑页 | 路由切换正确      |
| 空态            | 文案 + 禁用 CTA |

### Phase D：下载端点（0.25 人日） — ✅ 已落地（2026-09-12）

| 步 | 文件                                         | 变更                                                         |
| - | ------------------------------------------ | ---------------------------------------------------------- |
| 1 | `app/api/templates/[id]/download/route.ts` | 新建；`requireUserId` 鉴权；读 `template.files`；`jszip` 打包流       |
| 2 | 同上                                         | 响应头 `Content-Disposition: attachment; filename="<id>.zip"` |

验收:

| 项                 | 通过条件                |
| ----------------- | ------------------- |
| `下载 zip`          | 浏览器下载               |
| `unzip -l <file>` | 文件清单与当前 Template 一致 |

### Phase E：实例化对话框（0.5 人日）

| 步 | 文件                                 | 变更                                                                        |
| - | ---------------------------------- | ------------------------------------------------------------------------- |
| 1 | `src/lib/templates/param-form.tsx` | 5 路控件映射（§4.5）                                                             |
| 2 | Instantiate 对话框组件                  | 三步状态机；末步摘要卡                                                               |
| 3 | 接线                                 | 末步 CTA → `POST /api/templates/[id]/instantiate` → 跳 `/workspaces/<newId>` |

验收:

| 项                       | 通过条件        |
| ----------------------- | ----------- |
| `compose-app`（有 params） | 第 2 步渲染所有字段 |
| 末步                      | 创建工作区 + 跳转  |

### Phase F：侧边栏 + 新建引导页（0.25 人日，可选，最后） — ✅ 已落地（2026-09-12）

| 步 | 文件                                       | 变更         |
| - | ---------------------------------------- | ---------- |
| 1 | `src/components/app-sidebar.tsx`         | 按 §3 表     |
| 2 | `app/(protected)/templates/new/page.tsx` | 3 张卡（§4.6） |

---

## 7. 验收清单

| #  | 用例            | 步骤                                   | 通过条件                                     |
| -- | ------------- | ------------------------------------ | ---------------------------------------- |
| 1  | 侧边栏显示模板市场     | 刷新页面                                 | 资源管理组首项即 `模板市场`                          |
| 2  | 内置模板可见        | 访问 `/templates`                      | 卡片显示 `内置` 药丸，数量 ≥ 4                      |
| 3  | 上传 zip 成功     | 选 3 文件 zip                           | 跳编辑页，文件 tab 显示 3 行                       |
| 4  | 上传非法 zip      | 选 >10 MB / 含 zip-slip 测试包            | `APIError` 显示，无跳转                        |
| 5  | 清单 → 全屏编辑     | 点任一行                                 | 进入 `/templates/<id>/edit/<encoded>`；侧栏消失 |
| 6  | shell 高亮      | 编辑 `run.sh`                          | shell 语言高亮生效                             |
| 7  | 嵌套路径 json 高亮  | 编辑 `.devcontainer/devcontainer.json` | json 高亮生效                                |
| 8  | 语言兜底          | 编辑 `weird.xyz`                       | plaintext + monospace + 行号，不报错           |
| 9  | Cmd/Ctrl+S 保存 | 改后按键                                 | 同 `保存` 按钮                                |
| 10 | 深链            | 复制编辑 URL 至新标签                        | 同一文件直接打开                                 |
| 11 | 内置只读          | 进入内置模板编辑                             | `readOnly` 生效；`保存` 隐藏                    |
| 12 | dirty 拦截      | 改后点返回 / 关页                           | 浏览器原生确认弹出                                |
| 13 | 未登录拦截         | 未登录访问编辑 URL                          | 跳 `/login`                               |
| 14 | 入口文件下拉        | 基本信息 tab                             | 下拉选项 = 当前文件全集                            |
| 15 | 保存往返          | 改 → 保存 → 刷新                          | 内容保留                                     |
| 16 | 下载 zip        | 点 `下载 zip`                           | 浏览器下载，`unzip -l` 与清单一致                   |
| 17 | 参数表单          | 选 `compose-app` → 实例化                | 第 2 步渲染对应字段                              |

---

## 8. 风险

| #  | 风险                              | 缓解                                                       |
| -- | ------------------------------- | -------------------------------------------------------- |
| R1 | CodeMirror SSR                  | `next/dynamic({ ssr: false })`                           |
| R2 | 大模板保存慢（>200 文件或 >128 KB/个）      | 暂不动；后切 `workspace_payloads` 单行                           |
| R3 | 多用户并发编辑                         | 最后保存者赢（`updated_at`）；冲突 UI 延后                            |
| R4 | CodeMirror token 色 vs Geist 调色板 | Phase A 末轮校对                                             |
| R5 | `(fullscreen)` 路由鉴权漂移           | 加 Playwright 用例：未登录访问编辑 URL → `/login`                   |
| R6 | 嵌套路径还原异常（空 / `..`）              | 服务端 `redirect('/templates/[id]?tab=files')`              |
| R7 | 保存覆盖竞态                          | `lib/templates/service.ts` 合并走 `path`；Phase B 合入前 review |

---

## 9. 引用

| 主题      | 来源                                                                                  |
| ------- | ----------------------------------------------------------------------------------- |
| 数据模型    | `docs/FINAL-PLAN.md` §3, §9                                                         |
| 协议（已归档） | `docs/archive/TEMPLATE-PROTOCOL.md`                                                 |
| 视觉语言（外部权威） | `https://fchangjun.github.io/awesome-design-md-cn/design-md/vercel/DESIGN.md` |
| 视觉基础（本地落地） | `docs/UI-PERFORMANCE.md` v1.1 |
| 已下线     | `marketplace/{features,images}`（A 方案）                                               |
| 新建路由    | `app/(fullscreen)/templates/[id]/edit/[...path]/page.tsx`                            |
| 新建端点    | `GET /api/templates/[id]/download`                                                  |
| 端点改造    | `POST /api/templates/[id]` 接受 `{ files: [{ path, content }] }` 单文件增量；服务端按 `path` 合入 |

---

## 10. 变更记录：启动模板改造（2026-09-12）

Phase A–F 落地后按用户反馈追加的四项改造（已全部落地，tsc / eslint / build 复验通过）：

| #    | 改动                                                                                                        | 涉及文件                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 10.1 | 「模板市场」全部改名「启动模板」（侧边栏、面包屑、页面标题、空态引导）                                                                     | `components/app-sidebar.tsx`, `components/app-shell.tsx`, `templates/page.tsx`, `my-resources/{features,images}/page.tsx` |
| 10.2 | `/templates/new`「从空白」→ `POST /api/templates` 创建最小模板（id `blank-<ts><rand>`，entry `run.sh`）后直接进编辑器          | `app/(protected)/templates/new/page.tsx`                                    |
| 10.3 | 列表卡片「使用模板」→「添加到启动模板」：拉取详情后 fork 成 `source=user` 模板（原 Phase E 实例化对话框删除，实例化入口移至新建工作区向导）                    | `components/templates/template-list.tsx`                                   |
| 10.4 | 新建工作区向导第 3 步「环境配置」→「启动模板」：只列 `source=user` 的模板（已填好的），选中含 `params` 的模板时渲染 `ParamField`；提交走 `POST /api/templates/[id]/instantiate`（扩展支持 git / 代理 / OSS bucket 初始化，与 `createWorkspace` 对齐） | `steps/types.ts`, `steps/step-environment.tsx`, `steps/step-confirm.tsx`, `steps/steps-sidebar.tsx`, `new-workspace-form.tsx`, `api/templates/[id]/instantiate/route.ts` |

配套修复：`workspace-list.tsx` / `workspace-detail.tsx` 对 `imageUri` 直接 `.split()` 在模板工作区（`imageUri=null`）会崩，已改为空值回退 `templateId`；`myImages/myFeatures/myScripts` 等镜像选择字段已从 `WizardState` 移除。

---

## 11. 变更记录：配方 vs 我的启动模板（2026-09-12）

按用户反馈，原 §10 把两种本质不同的东西都叫「模板」是 IA 硬伤，明确分开：

| 概念 | 角色 | URL | 侧栏标题 | 图标 |
| --- | --- | --- | --- | --- |
| **配方** | 挖空的参考：内置 + 市场。等待 fork + 填好。 | `/templates` | 配方 | `LayoutTemplate` |
| **我的启动模板** | 已填好的启动副本：source=user。直接绑定工作区。 | `/launch-templates` | 我的启动模板 | `Rocket` |

| 卡片动作 | 配方（`/templates`） | 我的启动模板（`/launch-templates`） |
| --- | --- | --- |
| 主按钮 | 添加到我的启动模板（fork） | 创建工作区（跳 `/workspaces/new?template=<id>`） |
| 次按钮 | 查看（只读详情） | 编辑（详情可写） |

| 其它调整 | 说明 |
| --- | --- |
| 详情页右上操作 | builtin/marketplace → 「复制为我的」；user → 「保存 + 更多下拉」（下载 zip / 删除模板） |
| 向导第 3 步标题 | 「我的启动模板」，只列 `source==="user"`，空态引导去配方页 |
| `?template=<id>` | wizard 接受 query 预选，来源：`/launch-templates` 卡片的「创建工作区」 |
| 面包屑 | `/templates: 配方`，`/templates/new: 新建配方`，`/launch-templates: 我的启动模板` |

约定：今后不再把「待填空的源配方」与「已填好的启动副本」混称「模板」。

---

## 12. 变更记录：全屏模板编辑器（2026-09-12）

按用户反馈：编辑模板要走单独路由（像单文件全屏一样），双 Tab「元数据 / 文件（目录树 + 编辑器）」。一并清理旧路由。

| 改动 | 涉及文件 |
| --- | --- |
| 新建全屏编辑器 `/(fullscreen)/templates/[id]/edit/page.tsx`：56px 顶栏（返回/模板信息/source/只读药丸/Tabs 元数据|文件/保存+更多下拉）；元数据 Tab 完整表单（名称/描述/分类/入口/标签/超时/参数/端口）；文件 Tab 左 260px 目录树 + 右 CodeMirror；Cmd/Ctrl+S 自适应 Tab；beforeunload 拦截；配方全只读 | `app/(fullscreen)/templates/[id]/edit/page.tsx`（新建） |
| 新建目录树组件 `components/templates/directory-tree.tsx`：递归构树 + 文件夹展开/折叠 + dirty amber dot + 选中态 | `components/templates/directory-tree.tsx`（新建） |
| 删除旧详情页 `(protected)/templates/[id]/page.tsx`（4-Tab AppShell 版本） | 删除 |
| 删除旧单文件路由 `(fullscreen)/templates/[id]/edit/[...path]/page.tsx`（已被目录树覆盖） | 删除 |
| 删除旧文件 tab 组件 `components/templates/template-files-tab.tsx`（再无引用） | 删除 |
| 卡片入口：配方「查看」+ 模板「编辑」都跳 `/templates/[id]/edit`（user-only 才有保存按钮 / 删除项） | `components/templates/template-list.tsx`, `components/templates/launch-template-list.tsx` |
| 同步跳转：blank 创建、zip 上传、my-resources 「去配方」全部改跳 `/templates/[id]/edit` | `templates/new/page.tsx`, `template-page-actions.tsx`, `my-resources/{features,images}/page.tsx` |
| 词汇统一：「启动模板」→「模板」；空态/Toast/PageHeader desc 全部更新 | 全文 |

| 保存语义 | 端点 | 触发 |
| --- | --- | --- |
| 元数据保存（全量 upsert，含当前所有 dirty 文件） | `POST /api/templates` | 元数据 Tab 顶栏「保存」/ Cmd/Ctrl+S |
| 单文件保存（增量合并） | `POST /api/templates/[id]` `{files:[{path,content}]}` | 文件 Tab 顶栏「保存」/ Cmd/Ctrl+S |

**校验**：tsc 0 / eslint 0 / build 19.3s Compiled successfully + 58 页全过（新路由 `/templates/[id]/edit` 236 KB FLJS）。
