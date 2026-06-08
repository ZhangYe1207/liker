---
title: "验收清单: AI Chat 多会话 review 剩余 P2 收尾"
type: acceptance
date: 2026-06-08
plan: docs/plans/2026-06-08-001-fix-multi-conv-review-followup-plan.md
---

# 验收清单: AI Chat 多会话 review 剩余 P2 收尾

## 环境准备

- [ ] 后端：`cd backend && source .venv/bin/activate && uvicorn app.main:app --reload`
- [ ] 前端：`npm run dev`（http://localhost:5173）
- [ ] 已登录 Supabase 账号（AI 功能需登录）；确认 Supabase 项目未被 free-tier 暂停
- [ ] 后端测试：`cd backend && pytest -q`

## Unit 1 — conversation_id UUID 校验（P2#7）

- [ ] `POST /api/ai/chat` 传 `conversation_id="not-a-uuid"` → 返回 **422**（非 500）
- [ ] `POST /api/ai/search` 同上 → 422
- [ ] `PATCH /api/conversations/not-a-uuid` → 422
- [ ] `DELETE /api/conversations/not-a-uuid` → 422
- [ ] 合法 UUID（含不存在的）行为不变：不存在返回 404/正常空，已有会话正常工作
- [ ] 新增/更新测试覆盖畸形 id → 422

## Unit 2 — 错误响应契约统一（P2#8）

- [ ] 触发 404（不存在会话）→ 错误体结构与 embeddings 路由一致
- [ ] 触发 403（他人会话，IDOR 已堵）→ 同结构
- [ ] 触发 422（畸形输入）→ 同结构
- [ ] 前端 `src/services/ai.ts` 不再按 endpoint 分别解析 `{detail}` vs `error`
- [ ] HTTP status code 未被改动（仅结构统一）

## Unit 3 — 外部 API + LLM provider 超时（P2#11）

- [ ] `external_apis.py` 所有 httpx 调用带显式 `Timeout`
- [ ] 各 LLM provider client 显式 `timeout`（不再用 Anthropic SDK 默认 10min）
- [ ] 模拟慢上游：超时触发后 SSE 产出 error 事件并收尾，连接不长挂
- [ ] 超时常量集中定义，无散落魔法数

## Unit 4 — rename/delete 失败反馈（P2#13）

- [ ] 断网下「重命名会话」→ UI 回滚到原标题 + 可见错误提示
- [ ] 断网下「删除会话」→ 列表回滚 + 可见错误提示
- [ ] 不再有静默 `catch {}`（代码审查确认）
- [ ] 与 streaming 守卫（P1#2）无状态冲突

## Unit 5 — 死代码清理（P2#14 + P2#15）

- [ ] 全仓 grep 确认非流式 chat/search 分支无消费者后再删
- [ ] `chat_with_rag` 移除未使用的 `conversation_id` 参数 / docstring 与实现一致
- [ ] 删除非流式路径 + `search_with_tools` 非流式变体 + 对应测试
- [ ] `pytest` 全绿
- [ ] 流式 chat / search 端到端功能不受影响（发消息、出推荐、历史加载正常）

## 与 Plan Requirements 对应

| Plan 项 | 验收章节 |
|---------|----------|
| P2#7 | Unit 1 |
| P2#8 | Unit 2 |
| P2#11 | Unit 3 |
| P2#13 | Unit 4 |
| P2#14 + P2#15 | Unit 5 |
| P2#9 / #10 / #12 | 待决策，不在本轮验收 |

## 常见坑位

- 流式路径（chat/search）和 REST 路径两处都要校验 UUID，别只改一处
- 改错误契约时前后端必须同 PR，否则前端解析错位导致提示丢失
- 删死代码前务必 grep 确认无前端/外部消费者，单独 commit 便于回滚
- Supabase free-tier 7 天无活动会暂停，连不上先查暂停状态而非网络
