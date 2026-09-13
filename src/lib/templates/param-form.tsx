/**
 * params → 表单控件映射（§4.5）。
 *
 * 与 `lib/templates/validate.ts` 的 Param 类型对齐：
 *   string → Input / text → Textarea / number → Input[type=number]
 *   select → Select（Radix，空值用哨兵 "__none__" 规避空字符串限制）
 *   boolean → Switch
 */

"use client";

import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Param } from "@/lib/templates/types";

/** Radix Select 空值哨兵（不接受空字符串 value）。 */
export const PARAM_EMPTY = "__none__";

export function ParamField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const desc = param.required ? "必填" : "可选";

  if (param.type === "boolean") {
    return (
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel>{param.label}</FieldLabel>
          <FieldDescription>{desc}</FieldDescription>
        </FieldContent>
        <Switch checked={value === true} onCheckedChange={(v) => onChange(v)} />
      </Field>
    );
  }

  if (param.type === "select") {
    return (
      <Field orientation="vertical">
        <FieldLabel>{param.label}</FieldLabel>
        <FieldContent>
          <Select
            value={value == null ? PARAM_EMPTY : String(value)}
            onValueChange={(v) => onChange(v === PARAM_EMPTY ? "" : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PARAM_EMPTY}>不选择</SelectItem>
              {(param.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{desc}</FieldDescription>
        </FieldContent>
      </Field>
    );
  }

  if (param.type === "text") {
    return (
      <Field orientation="vertical">
        <FieldLabel htmlFor={`p-${param.key}`}>{param.label}</FieldLabel>
        <FieldContent>
          <Textarea
            id={`p-${param.key}`}
            value={String(value ?? "")}
            placeholder={param.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          <FieldDescription>{desc}</FieldDescription>
        </FieldContent>
      </Field>
    );
  }

  // string / number
  return (
    <Field orientation="vertical">
      <FieldLabel htmlFor={`p-${param.key}`}>{param.label}</FieldLabel>
      <FieldContent>
        <Input
          id={`p-${param.key}`}
          type={param.type === "number" ? "number" : "text"}
          min={param.min}
          max={param.max}
          value={String(value ?? "")}
          placeholder={param.placeholder}
          onChange={(e) =>
            onChange(
              param.type === "number"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
        <FieldDescription>{desc}</FieldDescription>
      </FieldContent>
    </Field>
  );
}
