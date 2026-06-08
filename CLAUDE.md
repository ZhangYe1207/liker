# Liker — Claude 工作规范

## 开发工作流：Compound Engineering

采用 Compound Engineering 四步循环，每次功能开发严格遵循：

### 1. Brainstorm → Plan（`/ce:brainstorm` → `/ce:plan`）
- 探索需求、讨论方案，生成详细实施计划
- 涉及 UI 改动时，Plan 阶段必须包含高保真布局描述或 HTML/CSS 原型
- UI 改动不得导致 `types.ts` / `store.ts` 大幅变化
- 用户审批 Plan 后才进入下一步
- **每份 Plan 必须同时产出一份对应的验收清单**，放在 `docs/acceptance-tests/`，命名规则：把 plan 文件名的 `-plan.md` 改为 `-acceptance.md`（例：`2026-03-30-001-feat-xxx-plan.md` → `2026-03-30-001-feat-xxx-acceptance.md`）。文档含：环境准备步骤、按 Phase 组织的可勾选验收用例、与 Plan SC 的对应关系、常见坑位

### 2. Work（`/ce:work`）
- 按 Plan 执行，每完成一个逻辑单元提交一次
- 提交使用 `/git-commit`

### 3. Review（`/ce:review`）
- 多 agent 代码审查，覆盖正确性、安全性、性能
- 修复审查发现的问题

### 4. Compound（`/ce:compound`）
- 沉淀本次开发中学到的知识：架构决策、踩坑记录、模式总结
- 更新 CLAUDE.md 或知识文件，让下一次开发更快

## PRD 文件

`PLAN.md` 是项目的产品需求文档，记录功能规划和完成状态。

## 项目简介

- **前端**：React 18 + TypeScript + Vite
- **后端**：Python + FastAPI（`backend/` 目录）
- **数据库**：Supabase PostgreSQL + pgvector（向量搜索）
- **AI**：多 LLM Provider 抽象（Claude/OpenAI/DeepSeek/Kimi/MiniMax）+ RAG + Function Calling
- **数据**：前端 CRUD 直连 Supabase（RLS），AI 功能走 FastAPI 后端
- 样式：纯 CSS 变量，无 UI 库，字体：Cormorant Garamond（展示）+ Outfit（UI）
- 详见 `PLAN.md` 和 `README.md`

## 路径规则

- 访问或修改文件时，一律使用相对于项目根目录的路径，不使用绝对路径
