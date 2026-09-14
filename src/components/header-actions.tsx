"use client";

import * as React from "react";

/**
 * 页面级操作按钮的「上移」机制。
 *
 * AppShell 顶栏左侧是面包屑导航，右侧通过本模块渲染当前页注册的操作按钮
 * （Vercel dashboard 风格：导航即操作，不重复页面标题）。
 *
 * - `HeaderActionsProvider` 包住整个 Shell，持有当前页的 actions。
 * - `RegisterHeaderActions` 由页面把 JSX 作为 children 注册进去；服务端组件
 *   也可以用它（children 跨 RSC 边界作为 React 元素传递）。
 * - 注册的是「整个元素」（含 Dialog 这类复合组件），状态仍归属页面本地。
 */
const HeaderActionsContext = React.createContext<{
  actions: React.ReactNode;
  setActions: (actions: React.ReactNode) => void;
} | null>(null);

export function HeaderActionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [actions, setActions] = React.useState<React.ReactNode>(null);

  return (
    <HeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

/** 顶栏右侧插槽：渲染在 AppShell sticky header 内，右对齐。 */
export function HeaderActions() {
  const ctx = React.useContext(HeaderActionsContext);
  if (!ctx?.actions) return null;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 px-4 md:px-5">
      {ctx.actions}
    </div>
  );
}

/** 页面侧注册入口：把操作 JSX 传给顶栏，渲染自身返回 null。 */
export function RegisterHeaderActions({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = React.useContext(HeaderActionsContext);

  React.useEffect(() => {
    ctx?.setActions(children);
    return () => ctx?.setActions(null);
  }, [children, ctx]);

  return null;
}