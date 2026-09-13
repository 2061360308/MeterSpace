export type EditorLanguage =
  | "json"
  | "yaml"
  | "shell"
  | "dockerfile"
  | "javascript"
  | "typescript"
  | "markdown"
  | "plaintext";

const EXT_MAP: Record<string, EditorLanguage> = {
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".json": "json",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".md": "markdown",
};

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

function lastExtension(name: string): string {
  // Hidden file like ".env" has no extension
  if (name.startsWith(".")) {
    const second = name.indexOf(".", 1);
    return second === -1 ? "" : name.slice(second).toLowerCase();
  }
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function detect(filename: string): EditorLanguage {
  if (!filename) return "plaintext";
  const base = basename(filename);
  if (base === "Dockerfile") return "dockerfile";
  return EXT_MAP[lastExtension(base)] ?? "plaintext";
}
