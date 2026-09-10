"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ProxySettings,
  type ProxySettingsValues,
} from "@/components/settings/proxy-settings";

type FetchedProxy = Partial<ProxySettingsValues> & {
  proxyUpstreamSecret: string | null;
};

export function ProxySettingsSection() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [values, setValues] = useState<Partial<ProxySettingsValues>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const p: FetchedProxy | null | undefined = s?.settings;
        if (p) {
          setValues({
            proxyMode: p.proxyMode ?? "disabled",
            proxyClashSubscription: p.proxyClashSubscription ?? "",
            proxyClashYaml: p.proxyClashYaml ?? "",
            proxyUpstreamUrl: p.proxyUpstreamUrl ?? "",
            proxyUpstreamUsername: p.proxyUpstreamUsername ?? "",
            proxyUpstreamSecret: "",
            proxyProbeUrls: p.proxyProbeUrls ?? [],
            proxyBypass: p.proxyBypass ?? [],
            clashBinUrl: p.clashBinUrl ?? "",
            hasSavedSecret: Boolean(p.proxyUpstreamSecret),
          });
        } else {
          setValues({
            proxyMode: "disabled",
          });
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  function patch(p: Partial<ProxySettingsValues>) {
    setValues((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        proxyMode: values.proxyMode ?? "disabled",
        proxyProbeUrls: values.proxyProbeUrls ?? [],
        proxyBypass: values.proxyBypass ?? [],
      };
      if (body.proxyMode === "clash") {
        body.proxyClashSubscription = values.proxyClashSubscription?.trim() || null;
        body.proxyClashYaml = values.proxyClashYaml?.trim() || null;
      }
      if (body.proxyMode === "upstream") {
        body.proxyUpstreamUrl = values.proxyUpstreamUrl?.trim() || null;
        body.proxyUpstreamUsername = values.proxyUpstreamUsername?.trim() || null;
        const secret = values.proxyUpstreamSecret?.trim();
        if (secret) body.proxyUpstreamSecret = secret;
      }
      body.clashBinUrl = values.clashBinUrl?.trim() || null;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存失败");
      }
      if (values.proxyUpstreamSecret) patch({ proxyUpstreamSecret: "", hasSavedSecret: true });
      toast.success("代理设置已保存");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/proxy/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clashSubscription:
            values.proxyMode === "clash" ? values.proxyClashSubscription?.trim() || undefined : undefined,
          clashYaml:
            values.proxyMode === "clash" ? values.proxyClashYaml?.trim() || undefined : undefined,
          upstreamUrl:
            values.proxyMode === "upstream" ? values.proxyUpstreamUrl?.trim() || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "测试失败");
      const entries = Object.entries(json.results ?? {});
      if (entries.length === 0) {
        toast.info("当前模式无待测试的配置");
        return;
      }
      const lines = entries.map(([k, v]) => {
        const r = v as { ok: boolean; detail: string };
        return `${k}: ${r.ok ? "通过" : "失败"} — ${r.detail}`;
      });
      if (entries.every(([, v]) => (v as { ok: boolean }).ok)) {
        toast.success(lines.join("\n"));
      } else {
        toast.error(lines.join("\n"));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <ProxySettings
        value={values}
        onChange={patch}
        onTest={test}
        testing={testing}
        saving={saving}
      />
    </form>
  );
}