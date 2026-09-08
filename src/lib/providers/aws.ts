import type { CloudProvider, CloudRegion } from "./types";

const AWS_REGIONS: CloudRegion[] = [
  { id: "us-east-1", label: "弗吉尼亚 (us-east-1)" },
  { id: "us-west-2", label: "俄勒冈 (us-west-2)" },
  { id: "ap-northeast-1", label: "东京 (ap-northeast-1)" },
  { id: "ap-southeast-1", label: "新加坡 (ap-southeast-1)" },
  { id: "eu-west-1", label: "爱尔兰 (eu-west-1)" },
  { id: "ap-east-1", label: "香港 (ap-east-1)" },
  { id: "cn-north-1", label: "北京 (cn-north-1)" },
  { id: "cn-northwest-1", label: "宁夏 (cn-northwest-1)" },
];

export class AWSProvider implements CloudProvider {
  readonly name = "aws";
  readonly label = "AWS";

  async getRegions(): Promise<CloudRegion[]> {
    // TODO: Replace with real AWS API call
    // Example: const client = new EC2Client({ region: "us-east-1" });
    // const command = new DescribeRegionsCommand({});
    // const result = await client.send(command);
    return AWS_REGIONS;
  }

  async hasCredentials(userId: string): Promise<boolean> {
    // TODO: Check if AWS credentials are configured
    void userId;
    return false;
  }
}
