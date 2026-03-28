---
title: "fix: 适配 categories 表 UNIQUE(user_id, name) 约束"
type: fix
status: active
date: 2026-03-28
---

# fix: 适配 categories 表 UNIQUE(user_id, name) 约束

## Overview

用户已在 Supabase 中手动清理了重复分类，并为 `categories` 表添加了 `UNIQUE(user_id, name)` 约束。代码中多处分类写入操作未考虑该约束，需要适配以避免运行时错误。

## Problem Frame

数据迁移至 Supabase 后产生了重复分类。用户已手动修复数据并添加 DB 约束，但前端代码未适配：
- 写入操作（upsert）未指定 `onConflict`，遇到同名分类会抛出 unique violation
- 无客户端重名校验，用户体验差
- 迁移脚本使用非确定性 UUID，重试会触发约束冲突
- SQL migration 文件未同步约束变更

## Requirements Trace

- R1. 所有分类写入操作在遇到 `UNIQUE(user_id, name)` 约束时不会崩溃
- R2. 用户创建同名分类时收到明确的中文错误提示
- R3. 迁移脚本在重试场景下能正确处理已存在的分类
- R4. SQL migration 文件与数据库实际 schema 保持同步

## Scope Boundaries

- 不改动 `types.ts` 或 `store` 结构
- 不改动分类的读取/删除逻辑
- 不做分类重命名/合并功能

## Context & Research

### Relevant Code and Patterns

- `src/data/supabase.ts` — `saveCategory`(L104)、`bulkSaveCategories`(L173) 均使用 `.upsert()` 无 `onConflict`
- `src/data/migration.ts` — L40 使用 `crypto.randomUUID()` 生成非确定性 ID，L51 使用 `.upsert()` 无 `onConflict`
- `src/App.tsx` — `handleAddCategory`(L219) 无客户端重名检查，错误提示为通用文案
- `src/components/SteamSyncModal.tsx` — L47 已有客户端检查（通过 regex 匹配），但未处理服务端约束冲突
- `supabase/migrations/001_initial_schema.sql` — L30-37 的 `categories` 表定义无 UNIQUE 约束
- 项目使用乐观更新 + error rollback 模式（`App.tsx` 中一致的 set → try/catch → rollback 模式）

## Key Technical Decisions

- **客户端重名校验 + 服务端约束兜底**：在 `handleAddCategory` 中先做客户端检查（快速反馈），数据层同时处理 Postgres 23505 错误（防并发）。不使用 `onConflict` 做 upsert-on-name，因为那会改变已有分类的 `id`，导致关联 items 引用断裂。
- **迁移脚本用 `onConflict: 'user_id,name'`**：迁移是一次性操作，用 upsert-on-name 处理重试是安全的（旧分类 ID 不被其他数据引用，因为 items 也在同一次迁移中重建）。
- **新增独立 migration 文件**：不修改 `001_initial_schema.sql`，遵循 migration 只追加的惯例。

## Implementation Units

- [ ] **Unit 1: 新增 SQL migration 同步 UNIQUE 约束**

  **Goal:** 版本控制中的 schema 与 Supabase 实际 schema 保持一致

  **Requirements:** R4

  **Dependencies:** None

  **Files:**
  - Create: `supabase/migrations/002_categories_unique_name.sql`

  **Approach:**
  - 添加 `ALTER TABLE public.categories ADD CONSTRAINT categories_user_name_unique UNIQUE (user_id, name)`
  - 加 `IF NOT EXISTS` 或用 `DO $$ ... $$` 包裹以保证幂等（约束已在线上存在）

  **Verification:**
  - Migration 文件存在且 SQL 语法正确

- [ ] **Unit 2: 数据层处理 unique violation 错误**

  **Goal:** `saveCategory` 和 `bulkSaveCategories` 能识别重名错误并抛出语义化异常

  **Requirements:** R1, R2

  **Dependencies:** None

  **Files:**
  - Modify: `src/data/supabase.ts`

  **Approach:**
  - 在 `saveCategory` 中检查 error.code 是否为 `'23505'`（Postgres unique violation），若是则抛出带有明确信息的错误（如 `分类名称已存在`），其他错误照常抛出
  - `bulkSaveCategories` 同理处理
  - 不改用 `onConflict`，保持 PK-based upsert 的语义

  **Patterns to follow:**
  - 现有的 `if (error) throw error` 模式，扩展为条件判断

  **Test scenarios:**
  - 正常创建新分类 → 成功
  - 创建与已有分类同名的分类 → 抛出 "分类名称已存在" 错误
  - 更新已有分类（同 id）→ 正常 upsert 成功

  **Verification:**
  - 创建同名分类时，前端显示 "分类名称已存在" 而非通用错误

- [ ] **Unit 3: 客户端重名校验与错误提示**

  **Goal:** 用户在 UI 中创建同名分类时，得到即时反馈

  **Requirements:** R2

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/App.tsx`

  **Approach:**
  - `handleAddCategory` 中在调用 `saveCategory` 前，检查 `categories` state 中是否已有同名分类（忽略大小写/trim）
  - 如果重名，直接 `showError('分类名称已存在')` 并 return 已有分类的 id（或空字符串）
  - catch 中识别数据层抛出的重名错误，使用具体提示而非通用 "添加分类失败"

  **Patterns to follow:**
  - 现有的乐观更新 + rollback 模式

  **Test scenarios:**
  - 客户端已有 "书籍" 分类，再创建 "书籍" → 立即提示 "分类名称已存在"，不发请求
  - 并发场景：客户端检查通过但服务端返回 23505 → rollback + 显示 "分类名称已存在"

  **Verification:**
  - 创建重名分类时立即看到中文错误提示，无网络请求发出

- [ ] **Unit 4: 迁移脚本适配 unique 约束**

  **Goal:** 迁移重试不会因 unique violation 失败

  **Requirements:** R1, R3

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/data/migration.ts`

  **Approach:**
  - categories upsert 调用添加 `{ onConflict: 'user_id,name' }`，使重试时以 name 匹配更新而非插入新行
  - 迁移中 items 引用的 `categoryIdMap` 需要适配：如果 upsert 命中已有行，需获取已有行的 id 来映射。考虑改为先 select 已有分类 → 对比 → 仅 insert 缺失的，同时构建正确的 id map
  - 注释与实际行为对齐（当前注释说 "deterministic ID" 但实际用 `crypto.randomUUID()`）

  **Patterns to follow:**
  - 现有的 `shouldMigrate` 幂等检查模式

  **Test scenarios:**
  - 首次迁移 → 所有分类和 items 正确创建
  - 部分失败后重试 → 已存在的分类被跳过或更新，items 正确关联
  - 本地有与 Supabase 同名分类 → 正确复用已有分类 ID

  **Verification:**
  - 迁移可安全重试，不会产生 unique violation 错误

## System-Wide Impact

- **Error propagation:** 数据层新增的语义化错误需要在 `App.tsx` 的 catch 中被正确识别和展示
- **State lifecycle risks:** 乐观更新后如果 unique violation rollback，UI 状态需完整恢复（现有 rollback 机制已覆盖）
- **API surface parity:** `SteamSyncModal` 通过 `onAddCategory` 调用同一个 `handleAddCategory`，自动获得保护

## Risks & Dependencies

- 用户已在 Supabase 手动添加约束，migration 文件需用幂等写法避免重复添加约束时报错
- `bulkSaveCategories` 当前无调用方，但仍需适配以保持接口一致性

## Sources & References

- Related code: `src/data/supabase.ts`, `src/data/migration.ts`, `src/App.tsx`
- Related schema: `supabase/migrations/001_initial_schema.sql`
