import OSS from "ali-oss";
import type { AliCredentials } from "./client";

/** OSS region id is like "oss-cn-hangzhou". */
export function ossRegion(region: string): string {
  return `oss-${region}`;
}

function client(
  creds: AliCredentials,
  region: string,
  bucket?: string,
): OSS {
  return new OSS({
    region: ossRegion(region),
    accessKeyId: creds.accessKeyId,
    accessKeySecret: creds.accessKeySecret,
    ...(bucket ? { bucket } : {}),
  });
}

export async function ensureBucket(
  creds: AliCredentials,
  region: string,
  bucket: string,
): Promise<void> {
  const c = client(creds, region);
  const exists = await bucketExists(creds, region, bucket);
  if (!exists) {
    await c.putBucket(bucket);
  }
}

export async function bucketExists(
  creds: AliCredentials,
  region: string,
  bucket: string,
): Promise<boolean> {
  try {
    const c = client(creds, region, bucket);
    await c.getBucketInfo(bucket);
    return true;
  } catch {
    return false;
  }
}

export interface ObjectMeta {
  name: string;
  size: number;
}

/** List all objects under a prefix (paginated). */
export async function listObjects(
  creds: AliCredentials,
  region: string,
  bucket: string,
  prefix: string,
): Promise<ObjectMeta[]> {
  const c = client(creds, region, bucket);
  const out: ObjectMeta[] = [];
  let marker: string | undefined;
  for (;;) {
    const res = await c.list(
      { prefix, marker, "max-keys": 1000 },
      {},
    );
    out.push(
      ...(res.objects ?? []).map((o) => ({ name: o.name, size: o.size })),
    );
    if (!res.isTruncated) break;
    marker = res.nextMarker;
  }
  return out;
}

/** Total bytes under a prefix. */
export async function prefixSize(
  creds: AliCredentials,
  region: string,
  bucket: string,
  prefix: string,
): Promise<number> {
  const objects = await listObjects(creds, region, bucket, prefix);
  return objects.reduce((sum, o) => sum + o.size, 0);
}

/** Delete a single object. */
export async function deleteObject(
  creds: AliCredentials,
  region: string,
  bucket: string,
  name: string,
): Promise<void> {
  const c = client(creds, region, bucket);
  await c.delete(name);
}

/** Delete all objects under a prefix (e.g. ws-{id}/). */
export async function deletePrefix(
  creds: AliCredentials,
  region: string,
  bucket: string,
  prefix: string,
): Promise<void> {
  const objects = await listObjects(creds, region, bucket, prefix);
  if (objects.length === 0) return;
  const c = client(creds, region, bucket);
  const names = objects.map((o) => o.name);
  for (let i = 0; i < names.length; i += 1000) {
    await c.deleteMulti(names.slice(i, i + 1000), { quiet: true });
  }
}
