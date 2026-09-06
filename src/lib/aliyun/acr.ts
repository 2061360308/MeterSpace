import { createRpcClient, acrEndpoint, API_VERSIONS } from "./client";
import type { AliCredentials } from "./client";

async function request<T>(
  creds: AliCredentials,
  region: string,
  action: string,
  params: Record<string, unknown>,
): Promise<T> {
  const client = createRpcClient({
    ...creds,
    endpoint: acrEndpoint(region),
    apiVersion: API_VERSIONS.acrEnterprise,
  });
  return await client.request<T>(action, params, { method: "POST" });
}

export interface AcrInstance {
  instanceId: string;
  instanceName: string;
  regionId: string;
  status: string;
}

export async function listInstances(
  creds: AliCredentials,
  region: string,
): Promise<AcrInstance[]> {
  const res = await request<{
    Instances?: { Instance?: AcrInstance[] };
  }>(creds, region, "ListInstance", { RegionId: region });
  return res.Instances?.Instance ?? [];
}

export async function createInstance(
  creds: AliCredentials,
  region: string,
  instanceName: string,
): Promise<string> {
  const res = await request<{
    InstanceId?: string;
  }>(creds, region, "CreateInstance", {
    RegionId: region,
    InstanceName: instanceName,
    InstanceType: "basic",
  });
  return res.InstanceId ?? "";
}

export interface Repository {
  repoId: string;
  repoName: string;
  repoNamespace: string;
  summary?: string;
  createTime?: number;
}

export async function listRepositories(
  creds: AliCredentials,
  region: string,
  instanceId: string,
): Promise<Repository[]> {
  const res = await request<{
    Repositories?: { Repository?: Repository[] };
  }>(creds, region, "ListRepository", {
    InstanceId: instanceId,
    RegionId: region,
    PageSize: 100,
    PageNo: 1,
  });
  return res.Repositories?.Repository ?? [];
}

export interface ImageTag {
  tag: string;
  digest?: string;
  updateTime?: number;
}

export async function listImageTags(
  creds: AliCredentials,
  region: string,
  instanceId: string,
  repoId: string,
): Promise<ImageTag[]> {
  const res = await request<{
    Images?: { Image?: ImageTag[] };
  }>(creds, region, "ListRepositoryTag", {
    InstanceId: instanceId,
    RepoId: repoId,
    RegionId: region,
  });
  return res.Images?.Image ?? [];
}
