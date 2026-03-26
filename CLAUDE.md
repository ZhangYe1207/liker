# Liker — Claude 工作规范

## 功能开发工作流（必须严格遵守）

**每次添加或修改功能，按以下顺序执行，不可跳步：**

1. **更新 PRD**（`PLAN.md`）
   - 修改涉及的章节：功能描述、设计细节、技术选型、数据模型变更等
   - 明确说明"等待审批"，不得擅自开始写代码

2. **等用户审批**
   - 用户明确 approve 后，才进入下一步

3. **编写代码**
   - 遵循 `commit-review` skill 的流程
   - 每完成一个逻辑单元提交一次

## 前端 UI 改动规则

- 先输出高保真示意图（可以是 HTML/CSS 原型，或详细的布局文字描述），不直接改组件
- UI 改动**不得导致数据结构大幅变化**（即 `types.ts` / `store.ts` 保持稳定）
- 示意图获得用户认可后，再开始实际代码修改

## PRD 文件

`PLAN.md` 是本项目的唯一 PRD，任何功能变更都需先更新它。

## 项目简介

- **React 18 + TypeScript + Vite**，纯前端，无服务端
- 数据存 `localStorage`，外部 API：Open Library / TMDB / iTunes
- 样式：纯 CSS 变量，无 UI 库，字体：Cormorant Garamond（展示）+ Outfit（UI）
- 详见 `PLAN.md`
