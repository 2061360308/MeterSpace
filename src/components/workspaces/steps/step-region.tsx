"use client";

import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { REGIONS } from "@/lib/constants";
import { type StepProps } from "./types";

export function StepRegion({ state, setState }: StepProps) {
  useEffect(() => {
    if (!state.region) return;

    setState((s) => ({ ...s, zonesLoading: true }));
    fetch(`/api/ecs/zones?region=${state.region}`)
      .then((r) => r.json())
      .then((data) => {
        setState((s) => ({
          ...s,
          zones: data.zones ?? [],
          zonesLoading: false,
        }));
      })
      .catch(() => {
        setState((s) => ({ ...s, zones: [], zonesLoading: false }));
      });
  }, [state.region, setState]);

  const selectedRegion = REGIONS.find((r) => r.id === state.region);
  const selectedZone = state.zones.find((z) => z.zoneId === state.zone);

  // Get available zones for the selected instance type
  const availableZones = useMemo(() => {
    if (!state.instanceType) return state.zones;
    const instanceAvail = state.instanceAvailability[state.instanceType];
    if (!instanceAvail) return state.zones;
    
    // Filter zones where the instance is available
    const availableZoneIds = new Set(
      instanceAvail.zones
        .filter((z) => z.status === "Available")
        .map((z) => z.zoneId)
    );
    
    // Return only zones where the instance is available, or all zones if no availability data
    return availableZoneIds.size > 0
      ? state.zones.filter((z) => availableZoneIds.has(z.zoneId))
      : state.zones;
  }, [state.instanceType, state.instanceAvailability, state.zones]);

  // Get the availability info for the selected instance
  const instanceAvailability = state.instanceType
    ? state.instanceAvailability[state.instanceType]
    : null;

  return (
    <div className="space-y-6">
      <Field orientation="vertical">
        <FieldLabel>地域</FieldLabel>
        <FieldContent>
          <Select
            value={state.region}
            onValueChange={(value) =>
              setState((s) => ({ ...s, region: value, zone: "" }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择地域" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((region) => (
                <SelectItem key={region.id} value={region.id}>
                  {region.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            实例创建后地域将无法更改；距离实例所在地域越近，访问速度越快
          </FieldDescription>
        </FieldContent>
      </Field>

      <Field orientation="vertical">
        <FieldLabel>可用区</FieldLabel>
        <FieldContent>
          {state.zonesLoading ? (
            <div className="flex items-center gap-2 h-10">
              <Spinner className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">加载可用区...</span>
            </div>
          ) : (
            <>
              <Select
                value={state.zone || "__auto__"}
                onValueChange={(value) =>
                  setState((s) => ({
                    ...s,
                    zone: value === "__auto__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="自动分配（推荐）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">自动分配（推荐）</SelectItem>
                  {availableZones.map((zone) => (
                    <SelectItem key={zone.zoneId} value={zone.zoneId}>
                      {zone.localName || zone.zoneId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {instanceAvailability && instanceAvailability.status === "Available" && (
                <div className="mt-2">
                  <Badge tone="green">{instanceAvailability.availableZones}个可用区有库存</Badge>
                </div>
              )}
              {instanceAvailability && instanceAvailability.status === "SoldOut" && (
                <div className="mt-2">
                  <Badge tone="red">所有可用区已售罄</Badge>
                </div>
              )}
            </>
          )}
          <FieldDescription>
            可用区是指在同一地域内，电力和网络互相独立的物理区域。选择&ldquo;自动分配&rdquo;将由系统自动选择最优可用区。
          </FieldDescription>
        </FieldContent>
      </Field>

      {selectedRegion && (
        <div className="rounded-lg bg-muted/50 p-4">
          <div className="text-sm">
            <span className="font-medium">已选择：</span>
            <span className="text-muted-foreground">
              {selectedRegion.label}
              {selectedZone && (
                <> / {selectedZone.localName || selectedZone.zoneId}</>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
