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
import { REGIONS, PROVIDERS } from "@/lib/constants";
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
        <FieldLabel>服务商</FieldLabel>
        <FieldContent>
          <Select
            value={state.provider}
            onValueChange={(value) => setState((s) => ({ ...s, provider: value }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择服务商" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            选择云服务商
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
            实例创建后地域将无法更改
          </FieldDescription>
        </FieldContent>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field orientation="vertical">
          <FieldLabel htmlFor="diskSize">磁盘大小 (GB)</FieldLabel>
          <FieldContent>
            <Input
              id="diskSize"
              type="number"
              min={20}
              max={500}
              value={state.diskSize}
              onChange={(e) => setState((s) => ({ ...s, diskSize: parseInt(e.target.value) || 40 }))}
            />
            <FieldDescription>
              系统盘大小，范围 20-500 GB
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field orientation="vertical">
          <FieldLabel htmlFor="bandwidth">带宽峰值 (Mbps)</FieldLabel>
          <FieldContent>
            <Input
              id="bandwidth"
              type="number"
              min={1}
              max={100}
              value={state.bandwidth}
              onChange={(e) => setState((s) => ({ ...s, bandwidth: parseInt(e.target.value) || 10 }))}
            />
            <FieldDescription>
              公网带宽峰值，范围 1-100 Mbps
            </FieldDescription>
          </FieldContent>
        </Field>
      </div>
    </div>
  );
}
