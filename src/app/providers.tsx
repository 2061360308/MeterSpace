"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * 客户端 Provider 容器。
 *
 * QueryClient 必须用 useState 惰性创建：模块级单例在 Next 的多次渲染 /
 * 热更新之间会串数据，且 SSR 下同进程多请求会共享缓存。
 *
 * 默认值按 docs/UI-PERFORMANCE.md 的原则：
 * - staleTime 30s：同一份数据 30s 内只请求一次，页面来回切不再打接口
 * - refetchOnWindowFocus：切回标签页校正一次（成本低，收益明显）
 * - retry 1：失败重试一次即可，避免慢接口被重试放大
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
