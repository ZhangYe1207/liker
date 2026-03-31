---
title: "feat: Themes — 预设主题切换"
type: feat
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-themes-ui-customization-requirements.md
---

# feat: Themes — 预设主题切换

## Overview

为 Liker 添加 5 套预设主题（暖光、深空、淡雅、樱花、森林），支持一键切换、跟随系统深色/浅色模式、平滑过渡动画，并将偏好同步至 Supabase。基于现有 CSS 变量系统扩展，不引入新依赖。

## Problem Frame

Liker 当前只有一套固定暖色调界面，用户无法根据个人喜好或使用环境调整外观。主题切换是 v2.0 "Delight & identity" 的核心功能，同时深色模式也是基本可用性需求。(see origin: `docs/brainstorms/2026-03-28-themes-ui-customization-requirements.md`)

## Requirements Trace

- R1. 5 套预设主题，每套包含完整配色方案
- R2. 文字与背景对比度满足 WCAG AA
- R3. Sidebar 底部主题切换快捷入口
- R4. 设置面板包含主题选择区域
- R5. 主题选择面板展示名称 + 预览色块
- R6. 切换时颜色平滑过渡 (~300ms)
- R7. 默认跟随系统深色/浅色模式
- R8. 手动选择后覆盖系统跟随
- R9. 提供"跟随系统"选项
- R10. 已登录用户主题偏好存 Supabase
- R11. 未登录用户主题偏好存 localStorage
- R12. 登录后云端偏好优先
- R13. Recharts 图表配色跟随主题
- R14. 状态颜色在所有主题中保持可辨识

## Scope Boundaries

- 不支持用户自定义颜色
- 不支持字体切换
- 不支持分类独立主题
- 不含主题商店/社区分享

## Context & Research

### Relevant Code and Patterns

- `src/index.css:9-39` — 17 个 `:root` CSS 变量（sidebar、main、text、accent、radius、font）
- `src/index.css` — ~76 处硬编码颜色值需转为 CSS 变量（紫色调 tint 如 `#f0edf8`、`#f8f5fc`、`#e8e4f0` 等）
- `src/index.css` — 部分未定义变量（`--text-dim`、`--text-primary`、`--accent`、`--bg-hover`）在 logbook/auth 区域引用
- `src/contexts/AuthContext.tsx` — Context provider 模式参考
- `src/main.tsx` — Provider 嵌套层级
- `src/components/StatsView.tsx:40-60` — Recharts 颜色常量：`CATEGORY_COLORS`、`STATUS_COLORS`、`RATING_COLOR`、`TOOLTIP_STYLE`
- `src/App.tsx:556-566` — Sparkline 渐变硬编码
- `src/services/steam.ts:16-30` — localStorage 简单读写模式（`liker_` 前缀）
- `supabase/migrations/001_initial_schema.sql` — `profiles.preferences jsonb DEFAULT '{}'` 已存在，当前未使用

### Institutional Learnings

- 无 `docs/solutions/` 目录

## Key Technical Decisions

- **`[data-theme]` 属性选择器切换**：在 `<html>` 元素设置 `data-theme="midnight"` 等属性，各主题用 `html[data-theme="xxx"]` 覆盖 `:root` 变量。比 class 切换更语义化，避免与样式 class 冲突
- **ThemeContext 独立于 DataLayer**：主题偏好不走 DataLayer（它是 entity-oriented），直接读写 `profiles.preferences` JSONB 和 `localStorage`，模式类似 Steam config 的简单 load/save
- **Recharts 颜色通过 ThemeContext 传递**：定义每个主题的 chart 颜色常量对象，StatsView 从 context 获取，而非运行时读 CSS 变量（避免 `getComputedStyle` 的复杂度和性能开销）
- **使用现有 `profiles.preferences` JSONB 列**：无需新建表或跑 migration，存储格式 `{"theme": "midnight"}` 或 `{"theme": "system"}`
- **渐进式硬编码颜色清理**：首先添加新 CSS 变量覆盖最高频的硬编码颜色（~15 个新变量），确保主题切换时主要界面元素变化一致。零星的低频硬编码可在后续逐步清理
- **"system" 作为一个特殊主题值**：`theme` 偏好可以是 `"warm"` | `"midnight"` | `"frost"` | `"sakura"` | `"forest"` | `"system"`，其中 `"system"` 表示跟随 OS

## Open Questions

### Resolved During Planning

- **Supabase 存储方案**：使用 `profiles.preferences` JSONB 列，`UPDATE profiles SET preferences = preferences || '{"theme":"midnight"}'::jsonb`。无需 migration
- **CSS transition 实现**：在 `body` 上添加 `transition: background-color 0.3s, color 0.3s`，CSS 变量本身不支持 transition，但使用变量的属性（background-color 等）支持
- **Recharts 图表配色**：每个主题定义独立的 chart 颜色对象（tooltip 背景、轴文字色、渐变色），通过 ThemeContext 暴露的 `chartColors` 属性读取
- **硬编码颜色清理策略**：新增 ~15 个 CSS 变量覆盖高频 tint 颜色（按钮背景、hover 态、边框、表格行），将硬编码值替换为变量引用

### Deferred to Implementation

- 各主题的具体色值 — 需在浏览器中实际渲染调色，确保和谐与对比度
- Recharts SVG 渐变 `<defs>` 的动态 ID — 需验证多个图表共存时的 ID 冲突策略
- 未定义变量（`--text-dim` 等）的正确映射 — 需检查实际使用位置后决定

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                          main.tsx
                             │
                        AuthProvider
                             │
                        ThemeProvider ← reads system preference via matchMedia
                         │       │       loads from localStorage / Supabase
                         │       │       sets html[data-theme] attribute
                        App    useTheme() → { theme, resolvedTheme, setTheme, chartColors }
                         │
              ┌──────────┼──────────┐
         Sidebar     StatsView    ThemePicker
      (toggle btn)  (chartColors)  (popover panel)
```

数据流：
1. `ThemeProvider` mount 时：读取 localStorage → 如有登录态读 Supabase `profiles.preferences` → 确定当前主题
2. 如主题为 "system"：注册 `matchMedia` listener，实时跟随 OS
3. `resolvedTheme` 是实际生效的主题名（system → warm/midnight），用于设置 `html[data-theme]`
4. CSS 变量通过 `html[data-theme="xxx"]` 选择器覆盖 `:root` 值
5. `chartColors` 是与 `resolvedTheme` 对应的 JS 对象，传给 Recharts 组件

## Implementation Units

- [x] **Unit 1: 主题定义模块 + CSS 变量扩展**

  **Goal:** 建立主题数据结构，扩展 CSS 变量系统，清理高频硬编码颜色

  **Requirements:** R1, R2, R14

  **Dependencies:** None

  **Files:**
  - Create: `src/lib/themes.ts`
  - Modify: `src/index.css`

  **Approach:**
  - `themes.ts` 导出主题定义对象：每个主题包含 `id`、`name`（中文）、`previewColors`（3 个代表色用于 UI 预览）、`chartColors`（tooltip bg、axis text、gradient start/end、rating color）
  - `index.css` 中新增 ~15 个 CSS 变量覆盖高频硬编码值：`--btn-secondary-bg`、`--btn-secondary-hover`、`--border-light`、`--row-bg`、`--row-hover`、`--row-border`、`--header-bg`、`--badge-bg`、`--confirm-bg`、`--confirm-hover` 等
  - 将 CSS 中引用这些色值的地方替换为新变量
  - 修复未定义变量引用（`--text-dim` → `--text-3`、`--accent` → `--coral` 等）
  - 为 5 个主题各写一组 `html[data-theme="xxx"]` CSS 变量覆盖块
  - 暖光（warm）作为 `:root` 默认值，无需额外属性

  **Patterns to follow:**
  - `src/index.css:9-39` 现有 CSS 变量命名惯例
  - `src/utils/statusLabels.ts` 作为 TS 常量模块的组织参考

  **Test scenarios:**
  - 手动在 DevTools 设置 `html[data-theme="midnight"]` → 整个界面切换到深色
  - 每个主题的文字/背景对比度检查（DevTools Accessibility）
  - 状态颜色（蓝/琥珀/绿/灰）在深色主题下仍可辨识
  - 无未定义变量引用（DevTools 无 fallback 警告）

  **Verification:**
  - 5 套完整的 CSS 变量覆盖块存在，手动切换 data-theme 属性可验证每套主题的视觉效果

- [x] **Unit 2: ThemeContext + 系统偏好检测**

  **Goal:** 创建主题上下文，管理主题状态、系统深色模式检测和偏好持久化

  **Requirements:** R7, R8, R9, R10, R11, R12

  **Dependencies:** Unit 1

  **Files:**
  - Create: `src/contexts/ThemeContext.tsx`
  - Modify: `src/main.tsx`

  **Approach:**
  - `ThemeContext` 提供：`theme`（用户选择，含 "system"）、`resolvedTheme`（实际生效的主题 ID）、`setTheme`、`chartColors`、`themes`（所有主题列表）
  - mount 时读取 localStorage（`liker_theme`）作为初始值，默认 "system"
  - 如果已登录，异步读取 Supabase `profiles.preferences.theme`，有值则覆盖 localStorage
  - `setTheme` 同时写入 localStorage 和 Supabase（已登录时）
  - "system" 模式：使用 `window.matchMedia('(prefers-color-scheme: dark)')` 注册监听，深色系统 → "midnight"，浅色 → "warm"
  - `resolvedTheme` 变化时设置 `document.documentElement.dataset.theme`
  - 在 `main.tsx` 中 `AuthProvider` 内侧包裹 `ThemeProvider`
  - Supabase 读写直接使用 `supabase` client，不走 DataLayer

  **Patterns to follow:**
  - `src/contexts/AuthContext.tsx` — Context provider 结构、`useEffect` 初始化、graceful null supabase 处理
  - `src/services/steam.ts:16-30` — localStorage 简单读写模式

  **Test scenarios:**
  - 首次访问（无 localStorage）→ 默认 "system"，系统浅色 → 暖光，深色 → 深空
  - 手动选择 "frost" → localStorage 存储 "frost"，界面切换
  - 切换回 "system" → 重新跟随 OS
  - 已登录用户换设备 → 从 Supabase 读取保存的主题
  - 未登录用户 → 仅使用 localStorage，无 Supabase 调用
  - OS 深色模式切换（系统设置变更）→ 当主题为 "system" 时自动跟随

  **Verification:**
  - ThemeContext 可在任何子组件中通过 `useTheme()` 访问主题状态和 chartColors

- [x] **Unit 3: 主题切换 UI（Sidebar 入口 + 选择面板）**

  **Goal:** 添加主题切换入口和主题选择弹出面板

  **Requirements:** R3, R4, R5, R6

  **Dependencies:** Unit 2

  **Files:**
  - Create: `src/components/ThemePicker.tsx`
  - Modify: `src/App.tsx`
  - Modify: `src/index.css`

  **Approach:**
  - Sidebar 底部（在 Steam 同步按钮下方）添加主题切换按钮，图标 🎨 + 当前主题名
  - 点击按钮弹出 `ThemePicker` 浮层（popover 风格，从按钮上方弹出）
  - ThemePicker 展示：6 个选项（5 主题 + "跟随系统"），每个选项显示主题名 + 3 个预览色块圆点，当前选中项高亮
  - 点击选项立即切换（调用 `setTheme`），关闭面板
  - 点击面板外部关闭
  - CSS transition：在 `body` 和关键元素上添加 `transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease`
  - ThemePicker 也可从设置面板访问（如果未来有设置面板，先预留结构）

  **Patterns to follow:**
  - Sidebar 现有按钮样式（`.sidebar-add-btn`、`.sidebar-steam-btn`）
  - 弹窗/浮层参考 `AddEditModal.tsx` 的 portal 模式或简单 CSS positioned popover

  **Test scenarios:**
  - 点击 🎨 按钮 → 面板弹出，展示 6 个选项
  - 点击 "深空" → 界面平滑过渡到深色，面板关闭
  - 点击面板外部 → 面板关闭，主题不变
  - 当前主题项显示选中标识
  - "跟随系统" 选项显示当前系统是深色还是浅色的提示
  - 移动端（<640px）面板正常显示，不溢出屏幕

  **Verification:**
  - 主题切换有平滑过渡效果，5 套主题 + 跟随系统均可正常切换

- [x] **Unit 4: Recharts 图表主题适配**

  **Goal:** 让 StatsView 和 Overview sparkline 的图表颜色跟随当前主题

  **Requirements:** R13

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/components/StatsView.tsx`
  - Modify: `src/App.tsx`

  **Approach:**
  - StatsView 和 sparkline 从 `useTheme()` 获取 `chartColors`
  - 替换硬编码的 `TOOLTIP_STYLE`（background 改为 chartColors.tooltipBg）
  - 替换 XAxis/YAxis tick fill（改为 chartColors.axisText）
  - 替换 AreaChart 渐变色（改为 chartColors.gradientStart/End）
  - `CATEGORY_COLORS` 保持不变（这些是数据区分色，不跟随主题）
  - `STATUS_COLORS` 保持不变（语义色，R14 要求可辨识）
  - `RATING_COLOR` 保持不变（amber 在所有主题下都合适）

  **Patterns to follow:**
  - 现有 `useAuth()` 在组件中的使用方式

  **Test scenarios:**
  - 深空主题下 → tooltip 背景变为深色，轴文字变为浅色
  - 切换主题 → 图表颜色即时更新
  - 分类饼图颜色不受主题影响
  - Sparkline 渐变色跟随主题

  **Verification:**
  - 所有主题下图表可读、配色协调，tooltip 和轴线不与背景色冲突

- [x] **Unit 5: 主题切换过渡动画 + 视觉打磨**

  **Goal:** 确保切换过渡流畅，所有主题视觉完整

  **Requirements:** R2, R6

  **Dependencies:** Unit 1, 3, 4

  **Files:**
  - Modify: `src/index.css`

  **Approach:**
  - 在 `body` 和主要容器元素上添加 CSS transition 属性
  - 逐个主题验证并微调：检查所有页面（Overview、分类详情、搜索结果、统计页、Logbook）在每个主题下的完整性
  - 检查并修复遗漏的硬编码颜色（尤其是 hover、focus 状态）
  - 确保 modal/弹窗的背景遮罩在深色主题下正确
  - 验证 WCAG AA 对比度

  **Test scenarios:**
  - 快速连续切换多个主题 → 动画不闪烁、不卡顿
  - 各主题下完整浏览所有页面 → 无视觉断裂（白色块、不可读文字等）
  - 深色主题下 modal 遮罩仍然有效
  - 输入框 placeholder 在所有主题下可读

  **Verification:**
  - 所有 5 套主题在所有页面上视觉完整、对比度达标、过渡平滑

## System-Wide Impact

- **Interaction graph:** ThemeContext 在 React 树顶层，theme 变化触发 `data-theme` 属性更新，CSS 变量级联到所有组件。Recharts 组件通过 `useTheme()` 读取 chartColors，属于 props 驱动不会引起额外副作用
- **Error propagation:** Supabase 读写偏好失败时静默降级到 localStorage（不阻塞 UI）。主题 CSS 加载失败时 `:root` 默认值（暖光）作为 fallback
- **State lifecycle risks:** `resolvedTheme` 依赖 `matchMedia` listener 的生命周期管理，需在 `useEffect` cleanup 中 removeListener。避免 SSR/hydration 问题（纯 SPA 无此风险）
- **API surface parity:** localStorage 和 Supabase 两种 DataLayer 模式下主题功能均可用
- **Integration coverage:** 需验证每个主题 × 每个页面的视觉完整性（Overview、分类、搜索、统计、Logbook、Modal）

## Risks & Dependencies

- **硬编码颜色覆盖不完全**：~76 处硬编码中优先清理高频使用的 ~30 处，低频的（如 toast 红色）可后续处理。风险：个别元素在新主题下视觉不一致
- **Recharts SVG 渐变 ID 冲突**：多个图表使用同名渐变 ID 时可能冲突。在 stats 审查中已部分解决（sparkline 使用独立 ID），需确认完整
- **`profiles.preferences` 首次写入**：`profiles` 表有自动创建触发器，但前端从未读写过此表，需验证 RLS 策略允许用户 UPDATE 自己的 preferences

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-28-themes-ui-customization-requirements.md](docs/brainstorms/2026-03-28-themes-ui-customization-requirements.md)
- Related code: `src/contexts/AuthContext.tsx`, `src/index.css`, `src/components/StatsView.tsx`
- Related CSS variables: `src/index.css:9-39`
- Supabase schema: `supabase/migrations/001_initial_schema.sql` (profiles.preferences)
