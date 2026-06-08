---
title: "Vite Fast Refresh：Context Provider 与 hook 必须拆到不同文件"
date: 2026-04-14
category: developer-experience
module: src/contexts/AuthContext
problem_type: developer_experience
component: tooling
symptoms:
  - "改 AuthContext.tsx 任意一行都触发整页 reload，而不是 React 组件级 hot update"
  - "调试 AI chat 流时一改样式就把进行中的 SSE 流冲掉，状态归零"
  - "console 没有 React Refresh 错误，仅 Vite 输出 [vite] hmr update（看似正常）但页面整刷"
root_cause: incomplete_setup
resolution_type: code_fix
severity: medium
related_components:
  - authentication
  - frontend_stimulus
tags:
  - vite
  - react-fast-refresh
  - hmr
  - context
  - hooks
  - file-organization
---

# Vite Fast Refresh：Context Provider 与 hook 必须拆到不同文件

## Problem

`src/contexts/AuthContext.tsx` 同时导出 `AuthProvider`（React 组件）+ `useAuth`（hook）+ `AuthContext`（普通对象）。Vite 的 React Fast Refresh 插件检测到「混合导出」会**放弃组件级热更**，整页 reload。开发体验 1：调试 AI chat 时改一行样式，进行中的 SSE 流被整页 reload 直接掐掉，state 全部丢失，必须重登重发。

## Symptoms

- 改 `AuthContext.tsx` → 整页 reload，URL state / scroll / in-flight fetch 全丢
- 改其它文件却正常 HMR —— 因为污染源只在 AuthContext 这一个文件
- 没有任何 console 报错；Vite 输出 `[vite] hmr update /src/contexts/AuthContext.tsx` 看似正常，但浏览器实际是 reload
- 一旦 Provider 文件还导出常量（如 `export const AuthContext = ...`）或 hook，问题就稳定复现

## Root Cause

React Fast Refresh 的不变式：**一个文件要么只导出 React 组件，要么只导出非组件**。Vite 的 `@vitejs/plugin-react` 在文件中检测到「至少一个组件 + 至少一个非组件」时，无法保证热更后引用关系一致，于是降级到整页 reload 保平安。

`AuthContext.tsx` 同时导出：
- `AuthProvider`（组件）✅
- `useAuth`（hook，非组件）❌
- `AuthContext`（context 对象，非组件）❌

只要混着导出，整文件失去 component-level HMR。

## Solution

把 hook 和 context 对象拆到独立文件。组件文件只导出组件。

**Before** (`src/contexts/AuthContext.tsx`)
```tsx
export const AuthContext = createContext<AuthState>(...)         // ❌ 非组件导出
export function AuthProvider({ children }) { ... }               // ✅ 组件
export function useAuth() { return useContext(AuthContext) }    // ❌ hook
```

**After**
```tsx
// src/contexts/AuthContext.tsx — 只导出 Provider 组件 + Context 引用（消费侧 useContext 用）
export const AuthContext = createContext<AuthState>(...)
export function AuthProvider({ children }) { ... }

// src/hooks/useAuth.ts — 独立文件，单一职责
import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'

export function useAuth() {
  return useContext(AuthContext)
}
```

调用方 import 路径从 `../contexts/AuthContext` 改成 `../hooks/useAuth`。Provider 文件保留 `AuthContext` 的导出是允许的（它不是组件但也不是 hook —— Fast Refresh 对 Context 对象 + 组件混导出没有像 hook+组件那样严格降级，但保险起见也可以再拆）。

实测拆完后：编辑 `AuthProvider` → 组件级热更，state 保留；编辑 `useAuth` → 也是组件树级别的细粒度 update，不再 reload。

## Why This Works

Fast Refresh 用「一个文件的导出形状」判断热更安全性。同文件混合导出 hook + 组件时：
1. 改组件 → 引擎不确定 hook 调用顺序是否变；
2. 改 hook → 引擎不确定使用该 hook 的组件该不该重渲；
3. 引擎选择「整页 reload」而不是冒险维持错误状态。

把 hook 拆出去后：组件文件改动 → 只重新挂载组件树，hook 引用稳定；hook 文件改动 → 重新执行使用方组件，不影响 Provider 实例。

## Prevention

1. **文件命名约定**：`contexts/Foo.tsx` 只放 `Provider` 组件 + Context 对象本身；`hooks/useFoo.ts` 只放 hook。这是 React 19 + Vite 项目模板（Next.js / Remix 也类似）的隐含规则。
2. **ESLint 规则**：开 `react-refresh/only-export-components`（来自 `eslint-plugin-react-refresh`），它会在编辑时直接报红 —— 比"页面莫名 reload"诊断快十倍。
   ```json
   // .eslintrc / eslint.config.js
   "rules": {
     "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }]
   }
   ```
3. **症状识别清单**：调试时若发现"改一行样式 SSE 流断了 / 输入框 focus 跳走 / scroll 位置归零" → 第一反应去 Network 面板看是不是 document 整刷，再去翻被改文件是否同时导出了组件 + hook。
4. **`allowConstantExport: true` 的用途**：Provider 文件想顺手 `export const FOO_KEY = '...'` 这种常量是允许的，开了这个 flag 就不会被规则误报。

## Related Issues

- 修复 commit：`2cde208 refactor(auth): extract useAuth to own file so Vite Fast Refresh works`
- Plan / 上下文：本修复发生在 `feat/ai-backend` 分支调试 AI chat SSE 流时，因为流式状态被整页 reload 不断打断才被定位
- 文档：[`react-refresh/only-export-components`](https://github.com/ArnaudBarre/eslint-plugin-react-refresh)
