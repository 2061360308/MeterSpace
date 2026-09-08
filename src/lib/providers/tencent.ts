import type { CloudProvider, CloudRegion } from "./types";

const TENCENT_REGIONS: CloudRegion[] = [
  { id: "ap-guangzhou", label: "广州 (ap-guangzhou)" },
  { id: "ap-shanghai", label: "上海 (ap-shanghai)" },
  { id: "ap-beijing", label: "北京 (ap-beijing)" },
  { id: "ap-shenzhen", label: "深圳 (ap-shenzhen)" },
  { id: "ap-hongkong", label: "香港 (ap-hongkong)" },
  { id: "ap-tokyo", label: "东京 (ap-tokyo)" },
  { id: "ap-singapore", label: "新加坡 (ap-singapore)" },
];

export class TencentProvider implements CloudProvider {
  readonly name = "tencent";
  readonly label = "腾讯云";

  async getRegions(): Promise<CloudRegion[]> {
    // TODO: Replace with real Tencent Cloud API call
    // Example: const client = new tencentcloud.sdk.vpc.v20170312.VpcClient();
    // const result = await client.DescribeRegions();
    return TENCENT_REGIONS;
  }

  async hasCredentials(userId: string): Promise<boolean> {
    // TODO: Check if Tencent Cloud credentials are configured
    void userId;
    return false;
  }
}
