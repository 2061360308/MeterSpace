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
}

/** Resolve a user selection ({id, version}) against the trusted catalog. */
export function resolveFeatures(selection: FeatureSelection[]): Feature[] {
  const catalog = listFeatures();
  const out: Feature[] = [];
  for (const sel of selection) {
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
