declare module "ali-oss" {
  export interface OSSOptions {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket?: string;
    internal?: boolean;
    [key: string]: unknown;
  }

  export interface OSSObject {
    name: string;
    size: number;
    [key: string]: unknown;
  }

  export interface ListResult {
    objects?: OSSObject[];
    prefixes?: string[];
    isTruncated: boolean;
    nextMarker?: string;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    putBucket(name: string): Promise<unknown>;
    getBucketInfo(name: string): Promise<unknown>;
    list(
      query: {
        prefix?: string;
        marker?: string;
        "max-keys"?: number;
        [key: string]: unknown;
      },
      options?: Record<string, unknown>,
    ): Promise<ListResult>;
    delete(name: string): Promise<unknown>;
    deleteMulti(
      names: string[],
      options?: { quiet?: boolean },
    ): Promise<unknown>;
  }
}
