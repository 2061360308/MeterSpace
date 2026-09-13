"use client";

import * as React from "react";
import { CodeEditor, type EditorLanguage } from "@/components/ui/code-editor";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";

interface Sample {
  language: EditorLanguage;
  filename: string;
  body: string;
}

const SAMPLES: Sample[] = [
  {
    language: "shell",
    filename: "run.sh",
    body: "#!/usr/bin/env bash\nset -euo pipefail\nexec python -m http.server 8080\n",
  },
  {
    language: "json",
    filename: ".devcontainer/devcontainer.json",
    body: '{\n  "name": "demo",\n  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",\n  "features": {\n    "ghcr.io/devcontainers/features/git:1": {}\n  },\n  "postCreateCommand": "bash .devcontainer/post-create.sh"\n}\n',
  },
  {
    language: "yaml",
    filename: "docker-compose.yml",
    body: "services:\n  app:\n    image: node:20\n    ports:\n      - \"8080:8080\"\n    volumes:\n      - .:/app\n    command: npm run dev\n",
  },
  {
    language: "dockerfile",
    filename: "Dockerfile",
    body: "FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 8080\nCMD [\"node\", \"server.js\"]\n",
  },
  {
    language: "javascript",
    filename: "post-create.js",
    body: "const fs = require('fs');\nconst path = require('path');\nconst out = path.join(process.cwd(), 'README.md');\nfs.writeFileSync(out, '# Hello\\n');\nconsole.log('wrote', out);\n",
  },
  {
    language: "typescript",
    filename: "types.ts",
    body: "export interface Params {\n  name: string;\n  port: number;\n  enableLogging?: boolean;\n}\n\nexport function applyParams(p: Params) {\n  console.log(p);\n}\n",
  },
  {
    language: "markdown",
    filename: "README.md",
    body: "# MeterSpace Demo\n\n> 仅用于 Phase A 的 CodeEditor 视觉验收。\n\n## 用法\n\n- 打开本页，验证 6 种语言高亮\n- 验证只读态：右侧示例\n- 验证焦点环：聚焦任一编辑器\n",
  },
  {
    language: "plaintext",
    filename: "weird.xyz",
    body: "this file has no extension and should render as plaintext with monospace + line numbers\n",
  },
];

function SampleEditor({ sample }: { sample: Sample }) {
  const [value, setValue] = React.useState(sample.body);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="label-mono text-muted-foreground">{sample.language}</span>
        <span className="text-sm text-muted-foreground">{sample.filename}</span>
      </div>
      <CodeEditor
        value={value}
        onChange={setValue}
        language={sample.language}
        minHeight={160}
      />
    </div>
  );
}

function ReadOnlyEditor({ sample }: { sample: Sample }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="label-mono text-muted-foreground">readOnly · {sample.language}</span>
        <span className="text-sm text-muted-foreground">{sample.filename}</span>
      </div>
      <CodeEditor
        value={sample.body}
        onChange={() => {}}
        language={sample.language}
        readOnly
        minHeight={140}
      />
    </div>
  );
}

export default function CodeEditorDemoPage() {
  const saveCountRef = React.useRef(0);
  const [saves, setSaves] = React.useState(0);

  const editableSample = SAMPLES[0]!;
  const [editable, setEditable] = React.useState(editableSample.body);

  return (
    <div className="space-y-8">
      <PageHeader
        title="CodeEditor 视觉验收"
        description="Phase A demo · 6 语言 + plaintext + 只读 + 焦点环"
      />

      <section className="space-y-4">
        <SectionHeader title="6 语言 + plaintext" />
        <div className="grid gap-6 md:grid-cols-2">
          {SAMPLES.map((s) => (
            <SampleEditor key={s.language + s.filename} sample={s} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="只读分支（`readOnly={true}`）" />
        <div className="grid gap-6 md:grid-cols-2">
          <ReadOnlyEditor sample={SAMPLES[1]!} />
          <ReadOnlyEditor sample={SAMPLES[2]!} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Cmd/Ctrl+S 验证" />
        <CodeEditor
          value={editable}
          onChange={setEditable}
          language={editableSample.language}
          minHeight={180}
          onSave={() => {
            saveCountRef.current += 1;
            setSaves(saveCountRef.current);
          }}
        />
        <p className="text-sm text-muted-foreground">
          已触发保存次数: <span className="font-medium text-foreground">{saves}</span>（编辑后按 Cmd/Ctrl+S 测试）
        </p>
      </section>
    </div>
  );
}
