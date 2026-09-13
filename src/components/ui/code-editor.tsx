"use client";

import * as React from "react";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { dockerFile as dockerfile } from "@codemirror/legacy-modes/mode/dockerfile";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { cn } from "cn";
import { detect, type EditorLanguage } from "@/lib/ui/lang-detect";

export type { EditorLanguage };
export { detect };

export interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  language: EditorLanguage;
  readOnly?: boolean;
  minHeight?: number;
  /** 例："100%" / "calc(100vh-56px)"。设置后编辑器本体占满该高。 */
  height?: string;
  className?: string;
  /** Cmd/Ctrl+S：触发保存。 */
  onSave?: () => void;
}

const vercelTheme = EditorView.theme(
  {
    "&": {
      color: "var(--foreground)",
      backgroundColor: "transparent",
      fontSize: "13px",
    },
    ".cm-content": { caretColor: "var(--foreground)" },
    ".cm-focused .cm-cursor": { borderLeftColor: "var(--ring)" },
    ".cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--muted)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--muted-foreground)",
      borderRight: "0 0 0 1px rgb(0 0 0 / 0.06)",
    },
    ".cm-activeLine": { backgroundColor: "var(--muted)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--foreground)",
    },
  },
  { dark: false },
);

function buildLanguageExtension(language: EditorLanguage): Extension | null {
  switch (language) {
    case "json":
      return json();
    case "yaml":
      return yaml();
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "markdown":
      return markdown();
    case "dockerfile":
      return StreamLanguage.define(dockerfile);
    case "shell":
      return StreamLanguage.define(shell);
    case "plaintext":
      return null;
  }
}

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  minHeight = 320,
  height,
  className,
  onSave,
}: CodeEditorProps) {
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const extensions = React.useMemo<Extension[]>(() => {
    const exts: Extension[] = [
      EditorView.lineWrapping,
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ]),
      vercelTheme,
    ];
    const langExt = buildLanguageExtension(language);
    if (langExt) exts.push(langExt);
    return exts;
  }, [language]);

  return (
    <div
      data-slot="code-editor"
      className={cn(
        "w-full overflow-hidden rounded-md bg-background shadow-border",
        className,
      )}
      style={height ? { height } : { minHeight }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        editable={!readOnly}
        height={height ?? "auto"}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
        }}
        theme="light"
      />
    </div>
  );
}
