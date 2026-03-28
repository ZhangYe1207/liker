---
title: "fix: 状态标签分类适配 + 重复检测 + 侧边栏登录可见性"
type: fix
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-27-liker-v1-evolution-requirements.md
---

# fix: 状态标签分类适配 + 重复检测 + 侧边栏登录可见性

## Overview

修复三个影响用户体验的 bug：(1) 状态标签在所有分类下都显示"想看/在看/看过"，对游戏和音乐分类不合适；(2) 用户可重复添加同一条目无任何提示；(3) 侧边栏登录/注册按钮太小，用户难以发现。

## Problem Frame

当前状态标签硬编码为"看"系列动词，语义仅适用于电影/剧集。书籍应为"读"、游戏应为"玩"、音乐应为"听"，自定义分类需要通用标签。此外，用户通过不同语言添加同一条目（如 "slay the spire 2" 和 "杀戮尖塔2"）时无任何提醒。侧边栏底部的登录按钮样式过于低调（12px、透明背景、暗淡颜色），用户首次使用时难以发现。

## Requirements Trace

- R3.4 (origin) Items display their current status as a visual badge → 标签应语义正确
- R3.5 (origin) Category detail page can be filtered by status → 筛选栏标签也要适配
- R1.1 (origin) Users can sign up / log in → 入口必须醒目可发现

## Scope Boundaries

- 不新增/修改 `types.ts` 中 `ItemStatus` 的枚举值（`want`/`in_progress`/`completed`/`dropped` 不变）
- 不做跨分类的去重（只检测同分类内重复）
- 不改变 Supabase schema
- 不做 title 的 NLP / 翻译比对（只做 normalize 后的模糊匹配 + externalId 精确匹配）

## Context & Research

### Relevant Code and Patterns

- `src/services/metadata.ts:28-37` — `detectCategory()` 函数，通过 name+icon 正则匹配返回 `MediaCategory` 类型，可复用于状态标签映射
- `src/components/StatusBadge.tsx` — 当前 `STATUS_CONFIG` 硬编码"想看/在看/看过/搁置"
- `src/components/AddEditModal.tsx:7-12` — 重复定义 `STATUS_OPTIONS`
- `src/App.tsx:486` — 分类详情页状态筛选栏内联硬编码标签
- `src/components/LogbookView.tsx:67-72` — Logbook 筛选下拉内联硬编码标签
- `src/components/ItemCard.tsx` — 使用 StatusBadge，但不传递分类信息
- `src/index.css:1447-1461` — `.sidebar-auth-btn` 样式：transparent bg, 12px font, dim color

### External References

无需外部研究，三个 bug 均为已有代码的局部修复。

## Key Technical Decisions

- **复用 `detectCategory()` 逻辑**：将 `metadata.ts` 中的 `detectCategory()` 提取为共享工具函数，状态标签映射基于其返回的 `MediaCategory` 类型。避免重复维护正则。
- **单一标签数据源**：新建 `src/utils/statusLabels.ts` 作为唯一真实来源，消除 4 处重复定义。所有组件和筛选栏均从此处读取标签。
- **去重策略：提醒不阻断**：保存时检测同分类下 externalId+source 精确匹配 和 title normalize 后模糊匹配，命中时弹出提示让用户选择继续或取消。不自动阻止。
- **Auth 按钮提升为独立视觉区块**：从 sidebar-footer 三按钮中分离，放到 sidebar 顶部或给予更醒目样式，确保首次使用的用户能立即发现。

## Open Questions

### Resolved During Planning

- **title normalize 规则**：统一为 lowercase + 去除空格/标点/特殊字符，足以捕获 "Slay The Spire 2" vs "slay the spire 2"。对于中英文同名（如 "杀戮尖塔2" vs "Slay the Spire 2"），因共享 `externalId+source` 来自同一 API 结果，精确匹配可覆盖；纯手动输入时无法自动匹配不同语言的标题，这在 scope boundary 中已明确。
- **Auth 按钮位置**：移到 sidebar 顶部（品牌名下方），未登录时显示为显眼的 CTA 样式，已登录时显示用户信息。

### Deferred to Implementation

- StatusBadge 组件签名的最终形式（是传 `mediaType` 还是 `categoryName`+`categoryIcon`）
- 去重提示的具体 UI 样式（inline warning 还是 confirm dialog）

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────┐
│ src/utils/statusLabels.ts (NEW - 单一数据源)      │
│                                                 │
│ detectMediaType(name, icon) → MediaType         │
│   (从 metadata.ts 提取的正则检测逻辑)             │
│                                                 │
│ getStatusLabels(mediaType) → StatusLabelMap      │
│   book   → 想读/在读/读过/搁置                    │
│   movie  → 想看/在看/看过/搁置                    │
│   anime  → 想看/在看/看过/搁置                    │
│   game   → 想玩/在玩/玩过/搁置                    │
│   music  → 想听/在听/听过/搁置                    │
│   *      → 想要/进行中/完成/搁置                  │
│                                                 │
│ getStatusLabel(status, mediaType) → string       │
│   组合 icon + label                              │
└─────────────────────────────────────────────────┘
           │
     被以下消费者引用：
     ├── StatusBadge.tsx (接收 mediaType prop)
     ├── AddEditModal.tsx (删除本地 STATUS_OPTIONS)
     ├── App.tsx 状态筛选栏
     └── LogbookView.tsx 状态筛选下拉
```

## Implementation Units

- [ ] **Unit 1: 提取共享状态标签工具**

  **Goal:** 建立状态标签的单一数据源，支持按分类类型返回不同标签

  **Requirements:** R3.4

  **Dependencies:** None

  **Files:**
  - Create: `src/utils/statusLabels.ts`
  - Modify: `src/services/metadata.ts` — 将 `detectCategory()` 提取到共享位置，`metadata.ts` 改为导入

  **Approach:**
  - 从 `metadata.ts` 提取 `detectCategory()` (重命名为 `detectMediaType()`) 到 `src/utils/statusLabels.ts`
  - `metadata.ts` 改为 `import { detectMediaType } from '../utils/statusLabels'` 并适配调用
  - 定义 `STATUS_LABELS` 映射表：`{ [mediaType]: { [status]: { label, icon } } }`
  - 导出 `getStatusLabel(status, mediaType?)` 和 `getStatusConfig(status, mediaType?)` 函数
  - `搁置` 标签在所有分类中通用，无需区分

  **Patterns to follow:**
  - `src/services/metadata.ts:28-37` 现有的 `detectCategory()` 正则模式

  **Test scenarios:**
  - `detectMediaType('书籍', '📖')` → `'book'`
  - `getStatusLabel('want', 'book')` → `'想读'`
  - `getStatusLabel('want', 'unknown')` → `'想要'`（通用 fallback）
  - `metadata.ts` 中的 `detectCategory` 调用不受影响

  **Verification:**
  - `npm run build` 无类型错误
  - `metadata.ts` 的搜索功能仍正常工作

- [ ] **Unit 2: 更新所有状态标签消费方**

  **Goal:** 消除 4 处标签硬编码，全部改为从 `statusLabels.ts` 读取

  **Requirements:** R3.4, R3.5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/components/StatusBadge.tsx` — 删除 `STATUS_CONFIG`，改为接收 `mediaType` prop 并调用 `getStatusConfig()`
  - Modify: `src/components/AddEditModal.tsx` — 删除 `STATUS_OPTIONS`，从 `statusLabels.ts` 读取，基于选中分类的 `detectMediaType()` 结果
  - Modify: `src/App.tsx` — 状态筛选栏（~line 486）改为调用 `getStatusLabel()`，基于 `selectedCategory` 的 mediaType
  - Modify: `src/components/LogbookView.tsx` — 状态筛选下拉改为调用 `getStatusLabel()`；LogbookEntry 的 StatusBadge 传入 mediaType（通过 itemId → item → categoryId → category → detectMediaType）
  - Modify: `src/components/ItemCard.tsx` — Props 新增可选 `mediaType`，传递给 StatusBadge

  **Approach:**
  - StatusBadge: `interface Props { status: ItemStatus; mediaType?: string; size?: 'sm' | 'md' }`
  - AddEditModal: 已有 `selectedCategory`（line 61），用 `detectMediaType(selectedCategory.name, selectedCategory.icon)` 获取类型，当用户切换分类时标签动态更新
  - App.tsx 状态筛选栏: 已有 `selectedCategory` 可用，同理
  - LogbookView: entries 关联 item 获取 categoryId，再从 categories 数组查找 category 获取 mediaType
  - ItemCard: 父组件 CategorySection 传入 mediaType

  **Patterns to follow:**
  - `AddEditModal.tsx:61` 已有 `selectedCategory` 的 derive 模式

  **Test scenarios:**
  - 书籍分类下 StatusBadge 显示"想读"而非"想看"
  - 游戏分类下筛选栏显示"🔖 想玩 / ▶ 在玩 / ✓ 玩过 / ✗ 搁置"
  - 自定义分类（如"收藏品⭐"）显示通用标签"想要/进行中/完成/搁置"
  - 切换 AddEditModal 中的分类下拉时，状态按钮标签实时更新
  - Logbook 中每条记录的 StatusBadge 根据其 item 所属分类正确显示

  **Verification:**
  - 全局搜索不再有硬编码的"想看/在看/看过"（除了 statusLabels.ts 中的定义）
  - 在不同分类下添加/查看 item，状态标签语义正确

- [ ] **Unit 3: 添加保存时重复检测**

  **Goal:** 用户保存 item 时检测同分类下是否已存在相似条目，弹出提示

  **Requirements:** 产品体验改进

  **Dependencies:** None（与 Unit 1/2 并行）

  **Files:**
  - Modify: `src/components/AddEditModal.tsx` — 在 `handleSave()` 中添加去重检查逻辑
  - Modify: `src/index.css` — 去重提示样式

  **Approach:**
  - AddEditModal 新增 `items` prop（或传入同分类 items 子集）
  - 在 `handleSave()` 中、调用 `onSave()` 之前：
    1. **externalId 精确匹配**：若当前 item 有 externalId+source，检查同分类下是否已有相同 externalId+source 的 item（编辑模式排除自身）
    2. **title normalize 匹配**：将 title lowercase + 去除标点空格后，与同分类已有 item 的 normalized title 比较
    3. 若命中，弹出内联提示（在保存按钮上方）："该分类下已存在类似条目: 《XXX》，是否仍要添加？" 提供"仍然添加"和"取消"按钮
    4. 用户点"仍然添加"→ 调用 `onSave()`；点"取消"→ 关闭提示
  - 编辑已有 item 时，去重检查应排除当前正在编辑的 item

  **Patterns to follow:**
  - `src/components/SteamSyncModal.tsx:58-69` Steam 同步的 title 去重模式（lowercase Set）
  - `src/components/ItemCard.tsx` 中已有的内联确认/取消模式（删除确认）

  **Test scenarios:**
  - 添加同分类下已有 title（不同大小写）→ 弹出提示
  - 选择 API 搜索结果后保存，externalId 已存在 → 弹出提示
  - 编辑已有 item 保存 → 不触发自身去重
  - 不同分类下相同 title → 不提示（跨分类允许重复）
  - 用户选择"仍然添加" → 正常保存

  **Verification:**
  - 手动测试：在同一分类下添加两个相同标题的 item，第二次应弹出提示
  - 选择 API 搜索结果保存已有条目，应弹出提示

- [ ] **Unit 4: 提升侧边栏登录/注册可见性**

  **Goal:** 让登录/注册入口更醒目，新用户能立即发现

  **Requirements:** R1.1

  **Dependencies:** None（与其他 Unit 并行）

  **Files:**
  - Modify: `src/App.tsx` — 调整 auth 按钮位置和结构
  - Modify: `src/index.css` — auth 按钮新样式

  **Approach:**
  - **未登录状态**：将登录按钮从 sidebar-footer 底部移到 sidebar 顶部（紧随品牌名 "Liker" 下方），使用更醒目的样式：
    - 半透明边框 + 较大字号（14px）
    - ☁ 云同步 · 登录 / 注册 — 暗示登录的价值（云同步）
    - 圆角 pill 样式，hover 有微光效果
  - **已登录状态**：同样在 sidebar 顶部显示用户信息：
    - 👤 用户名（email prefix）
    - 点击展开小下拉菜单或直接登出（保持现有行为即可）
  - sidebar-footer 不再包含 auth 按钮，只保留"新增记录"和"Steam 同步"

  **Patterns to follow:**
  - `.sidebar-add-btn` 的样式权重感（14px, 600 weight, gradient）作为"醒目"的参考基准
  - `.sidebar-steam-btn` 的 outlined 样式作为"次要但可见"的参考

  **Test scenarios:**
  - 未登录用户打开 App，侧边栏顶部应显示醒目的"登录/注册"按钮
  - 已登录用户看到自己的用户名/邮箱前缀
  - 响应式 < 900px 下按钮仍可见且可点击
  - 点击行为不变：未登录打开 AuthModal，已登录 signOut

  **Verification:**
  - 视觉检查：未登录时 sidebar 顶部的登录按钮应在 3 秒内被注意到
  - 功能正常：登录/登出流程不受影响

## System-Wide Impact

- **StatusBadge 签名变更**：新增可选 `mediaType` prop，所有 StatusBadge 调用点需更新传参。向后兼容（不传 mediaType 时 fallback 为通用标签或"看"系列）
- **AddEditModal 签名变更**：新增 `items` prop 用于去重检测。调用方（App.tsx）需传入
- **detectCategory 提取**：`metadata.ts` 从内部函数改为导入外部模块，无行为变化
- **CSS 变更**：新增 `.sidebar-auth-section` 等样式，不影响已有样式

## Risks & Dependencies

- **StatusBadge 调用点遗漏**：需全局搜索确保所有 StatusBadge 使用点都传递了 mediaType
- **LogbookView 性能**：每条 logbook entry 需 item → category 两次查找，数据量大时可考虑预计算 Map，但当前量级（< 200 条）无需优化

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-27-liker-v1-evolution-requirements.md](docs/brainstorms/2026-03-27-liker-v1-evolution-requirements.md)
- Related code: `src/services/metadata.ts` detectCategory, `src/components/StatusBadge.tsx`
- Related plan: `docs/plans/2026-03-27-001-feat-v1-supabase-metadata-logbook-plan.md`
