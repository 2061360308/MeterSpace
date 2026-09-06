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
    Data?: {
      AvailableAmount?: string;
      AvailableCashAmount?: string;
      CreditAmount?: string;
      Currency?: string;
    };
  };
  const d = res.Data ?? {};
  return {
    availableAmount: Number(d.AvailableAmount ?? 0),
    availableCashAmount: Number(d.AvailableCashAmount ?? 0),
    creditAmount: Number(d.CreditAmount ?? 0),
    currency: d.Currency ?? "CNY",
  };
}
