"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { REGIONS } from "@/lib/constants";
import { type StepProps } from "./types";

export function StepBasic({ state, setState }: StepProps) {
  const [enabledRegions, setEnabledRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/regions")
      .then((r) => r.json())
      .then((data) => {
        setEnabledRegions(data.regions ?? ["cn-hangzhou"]);
        setLoading(false);
      })
      .catch(() => {
        setEnabledRegions(["cn-hangzhou"]);
        setLoading(false);
      });
  }, []);

  const enabledRegionList = REGIONS.filter((r) => enabledRegions.includes(r.id));

  return (
    <div className="space-y-6">
      <Field orientation="vertical">
        <FieldLabel htmlFor="name">实例名称</FieldLabel>
        <FieldContent>
          <Input
            id="name"
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            placeholder="my-project"
          />
          <FieldDescription>
            名称将同时用作 ECS 实例名称
          </FieldDescription>
        </FieldContent>
      </Field>

      <Field orientation="vertical">
        <FieldLabel>地域</FieldLabel>
        <FieldContent>
          {loading ? (
            <div className="flex items-center gap-2 h-10">
              <Spinner className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">加载地域...</span>
            </div>
          ) : (
            <Select
              value={state.region}
              onValueChange={(value) => setState((s) => ({ ...s, region: value }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择地域" />
              </SelectTrigger>
              <SelectContent>
                {enabledRegionList.map((region) => (
                  <SelectItem key={region.id} value={region.id}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldDescription>
            实例创建后地域将无法更改；请在侧边栏&ldquo;地域选择&rdquo;中开通更多地域
          </FieldDescription>
        </FieldContent>
      </Field>
    </div>
  );
}
