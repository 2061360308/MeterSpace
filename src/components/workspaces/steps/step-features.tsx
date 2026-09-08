"use client";

import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { type StepProps } from "./types";

export function StepFeatures({ state, setState }: StepProps) {
  useEffect(() => {
    if (state.featureDefs.length > 0) return;

    fetch("/api/features")
      .then((r) => r.json())
      .then((data) => {
        setState((s) => ({ ...s, featureDefs: data.features ?? [] }));
      })
      .catch(() => {});
  }, [state.featureDefs.length, setState]);

  const toggleFeature = (featureId: string, checked: boolean) => {
    setState((s) => {
      const selectedFeatures = { ...s.selectedFeatures };
      if (checked) {
        const feature = s.featureDefs.find((f) => f.id === featureId);
        if (feature && feature.versions.length > 0) {
          selectedFeatures[featureId] = feature.versions[0].version;
        }
      } else {
        delete selectedFeatures[featureId];
      }
      return { ...s, selectedFeatures };
    });
  };

  const updateVersion = (featureId: string, version: string) => {
    setState((s) => ({
      ...s,
      selectedFeatures: { ...s.selectedFeatures, [featureId]: version },
    }));
  };

  if (state.featureDefs.length === 0) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="h-4 w-4" />
          <span>加载工具列表...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.featureDefs.map((feature) => {
        const isSelected = feature.id in state.selectedFeatures;
        return (
          <div
            key={feature.id}
            className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
              isSelected ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <Checkbox
              id={feature.id}
              checked={isSelected}
              onCheckedChange={(checked) =>
                toggleFeature(feature.id, checked === true)
              }
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label htmlFor={feature.id} className="font-medium cursor-pointer">
                {feature.name}
              </Label>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
              {feature.companion && (
                <p className="text-xs text-muted-foreground">
                  配套: {feature.companion}
                </p>
              )}
            </div>
            {isSelected && feature.versions.length > 0 && (
              <select
                className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={state.selectedFeatures[feature.id]}
                onChange={(e) => updateVersion(feature.id, e.target.value)}
              >
                {feature.versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}

      {Object.keys(state.selectedFeatures).length > 0 && (
        <div className="pt-4">
          <p className="text-sm text-muted-foreground">
            已选择 {Object.keys(state.selectedFeatures).length} 个工具
          </p>
        </div>
      )}
    </div>
  );
}
