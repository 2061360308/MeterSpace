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
import { type StepProps, type CloudInstance } from "./types";

interface PriceDetail {
  resource: string;
  originalPrice: number;
  tradePrice: number;
  discountPrice?: number;
}

export function StepBasic({ state, setState }: StepProps) {
  const [enabledRegions, setEnabledRegions] = useState<string[]>([]);
  const [cloudInstances, setCloudInstances] = useState<CloudInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceDetails, setPriceDetails] = useState<PriceDetail[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

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

  useEffect(() => {
    if (!state.provider || !state.region) return;
    
    fetch(`/api/cloud-instances?provider=${state.provider}&region=${state.region}`)
      .then((r) => r.json())
      .then((data) => {
        setCloudInstances(data.instances ?? []);
        if (data.instances?.length > 0 && !state.cloudInstanceId) {
          setState((s) => ({ ...s, cloudInstanceId: data.instances[0].id }));
        }
      })
      .catch(() => {
        setCloudInstances([]);
      });
  }, [state.provider, state.region, state.cloudInstanceId, setState]);

  useEffect(() => {
    if (!state.cloudInstanceId || !state.region) return;
    
    const selectedInstance = cloudInstances.find((i) => i.id === state.cloudInstanceId);
    if (!selectedInstance) return;

    setPriceLoading(true);
    fetch(`/api/ecs/price?region=${state.region}&instanceType=${selectedInstance.instanceType}&diskSize=${state.diskSize}&bandwidth=${state.bandwidth}`)
      .then((r) => r.json())
      .then((data) => {
        setPriceDetails(data.details ?? []);
      })
      .catch(() => {
        setPriceDetails([]);
      })
      .finally(() => {
        setPriceLoading(false);
      });
  }, [state.cloudInstanceId, state.region, state.diskSize, state.bandwidth, cloudInstances]);

  const enabledRegionList = REGIONS.filter((r) => enabledRegions.includes(r.id));
  const filteredInstances = cloudInstances.filter(
    (i) => i.provider === state.provider && i.region === state.region
  );

  const totalHourlyPrice = priceDetails.reduce((sum, d) => sum + d.tradePrice, 0);

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
            onValueChange={(value) => setState((s) => ({ ...s, provider: value, cloudInstanceId: "" }))}
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
            选择云服务商后将筛选对应地域的弹性规格
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
              onValueChange={(value) => setState((s) => ({ ...s, region: value, cloudInstanceId: "" }))}
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

      {state.provider && state.region && (
        <Field orientation="vertical">
          <FieldLabel>弹性规格</FieldLabel>
          <FieldContent>
            {filteredInstances.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  该地域暂无弹性规格，请先在{" "}
                  <a href="/cloud-instances" className="text-primary underline">
                    弹性规格管理
                  </a>{" "}
                  中创建
                </p>
              </div>
            ) : (
              <Select
                value={state.cloudInstanceId}
                onValueChange={(value) => setState((s) => ({ ...s, cloudInstanceId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择弹性规格" />
                </SelectTrigger>
                <SelectContent>
                  {filteredInstances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name} - {instance.instanceType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FieldDescription>
              选择已创建的弹性规格，将用于创建工作区实例
            </FieldDescription>
          </FieldContent>
        </Field>
      )}

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

      {state.cloudInstanceId && state.region && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">预估费用</h3>
            {priceLoading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <div className="text-right">
                <div className="text-lg font-bold text-primary">
                  ¥{totalHourlyPrice.toFixed(4)}/小时
                </div>
                <div className="text-xs text-muted-foreground">
                  约 ¥{(totalHourlyPrice * 24).toFixed(2)}/天
                </div>
              </div>
            )}
          </div>
          {!priceLoading && priceDetails.length > 0 && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {priceDetails.map((detail, index) => (
                <div key={index} className="flex justify-between">
                  <span>{detail.resource === "instanceType" ? "实例" : detail.resource === "systemDisk" ? "系统盘" : detail.resource}</span>
                  <span>¥{detail.tradePrice.toFixed(4)}/小时</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
