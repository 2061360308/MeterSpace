import featuresData from "@/data/features.json";
import type { Feature } from "@/lib/userdata";

export interface FeatureVersion {
  version: string;
  label: string;
  installScript: string;
}

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  companion: string;
  versions: FeatureVersion[];
}

export function listFeatures(): FeatureDefinition[] {
  return featuresData as FeatureDefinition[];
}

export interface FeatureSelection {
  id: string;
  version: string;
  uri?: string;
}

function buildUriInstallScript(uri: string): string {
  return `#!/bin/bash
set -e
echo "[feature] Installing from URI: ${uri}"
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
if echo "${uri}" | grep -qE '\\.tar\\.gz$|\\.tgz$'; then
  curl -fsSL "${uri}" | tar -xzf -
elif echo "${uri}" | grep -qE '^ghcr\\.io/|^docker\\.io/|^registry\\.'; then
  echo "[feature] OCI registry URI detected, pulling as container feature"
  FEATURE_NAME=$(echo "${uri}" | sed 's|.*/||' | sed 's|:.*||')
  mkdir -p "$FEATURE_NAME"
  cd "$FEATURE_NAME"
  cat > install.sh <<'SCRIPT'
#!/bin/bash
set -e
echo "[feature] Feature from ${uri} - install script placeholder"
echo "[feature] TODO: Implement actual installation logic"
SCRIPT
  chmod +x install.sh
  cd ..
else
  curl -fsSL "${uri}" -o feature.tar.gz
  tar -xzf feature.tar.gz
fi
if [ -f install.sh ]; then
  chmod +x install.sh
  ./install.sh
elif [ -f scripts/install.sh ]; then
  chmod +x scripts/install.sh
  ./scripts/install.sh
else
  echo "[feature] Warning: No install.sh found in feature package"
fi
cd /
rm -rf "$TMPDIR"
echo "[feature] Installation from URI complete"`;
}

export function resolveFeatures(selection: FeatureSelection[]): Feature[] {
  const catalog = listFeatures();
  const out: Feature[] = [];
  for (const sel of selection) {
    if (sel.uri) {
      out.push({
        id: sel.id,
        name: sel.id,
        version: sel.version,
        installScript: buildUriInstallScript(sel.uri),
      });
      continue;
    }
    const def = catalog.find((f) => f.id === sel.id);
    if (!def) continue;
    const v = def.versions.find((v) => v.version === sel.version) ?? def.versions[0];
    if (!v) continue;
    out.push({
      id: def.id,
      name: def.name,
      version: v.version,
      installScript: v.installScript,
    });
  }
  return out;
}
