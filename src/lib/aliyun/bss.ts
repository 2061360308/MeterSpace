import { createRpcClient, BSS_ENDPOINT, API_VERSIONS } from "./client";
import type { AliCredentials } from "./client";

export interface AccountBalance {
  availableAmount: number;
  availableCashAmount: number;
  creditAmount: number;
  currency: string;
}

export async function queryAccountBalance(
  creds: AliCredentials,
): Promise<AccountBalance> {
  const client = createRpcClient({
    ...creds,
    endpoint: BSS_ENDPOINT,
    apiVersion: API_VERSIONS.bss,
  });
  const res = (await client.request("QueryAccountBalance", {})) as {
    data?: {
      availableAmount?: string;
      availableCashAmount?: string;
      creditAmount?: string;
      currency?: string;
    };
  };
  const d = res.data ?? {};
  return {
    availableAmount: Number(d.availableAmount ?? 0),
    availableCashAmount: Number(d.availableCashAmount ?? 0),
    creditAmount: Number(d.creditAmount ?? 0),
    currency: d.currency ?? "CNY",
  };
}
