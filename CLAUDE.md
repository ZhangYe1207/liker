# Liker — Claude 工作规范

## 开发工作流：Compound Engineering

采用 Compound Engineering 四步循环，每次功能开发严格遵循：

### 1. Brainstorm → Plan（`/ce:brainstorm` → `/ce:plan`）
- 探索需求、讨论方案，生成详细实施计划
- 涉及 UI 改动时，Plan 阶段必须包含高保真布局描述或 HTML/CSS 原型
- UI 改动不得导致 `types.ts` / `store.ts` 大幅变化
- 用户审批 Plan 后才进入下一步

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

- **React 18 + TypeScript + Vite**，纯前端，无服务端
- 数据存 `localStorage`，外部 API：Open Library / TMDB / iTunes / Steam
- 样式：纯 CSS 变量，无 UI 库，字体：Cormorant Garamond（展示）+ Outfit（UI）
- 详见 `PLAN.md`

## 路径规则

- 访问或修改文件时，一律使用相对于项目根目录的路径，不使用绝对路径
