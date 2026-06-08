---
title: "fix: AI Chat 多会话 review 剩余 P2 收尾"
type: fix
status: active
date: 2026-06-08
origin: .context/compound-engineering/ce-review/2026-05-06-multi-conv/REPORT.md
---

# fix: AI Chat 多会话 review 剩余 P2 收尾

## Overview

多会话持久化（plan `2026-04-13-001`）的 14-agent code review 已清零全部 P0/P1 + P2#6，剩下一批 P2 走本 follow-up plan 跟踪。本 plan 把剩余 P2 拆成「可直接修」与「需决策」两类：可直接修的是输入校验、错误契约统一、超时、死代码三组确定性改动；需决策的是前端是否切到 REST、同步 client 是否异步化、重复会话幂等性三个架构/产品取舍。

## Problem Frame

review 报告（见 origin）P2 段列了 #7–#15 共 9 项。其中 #6 已在 `d99d0b8` 修复。剩余 8 项按 owner 分为 `review-fixer`（确定性修复）和 `human`（架构决策）。本 plan 只把 `review-fixer` 类纳入实施单元；`human` 类作为「待决策」列出，由用户拍板后再开 Unit 或单独 plan。

## Requirements Trace

来自 review 报告 P2：

- **P2#7**. `conversation_id` 校验 UUID 格式，畸形输入不再触发 500
- **P2#8**. 错误响应契约统一（`/api/conversations` 与其它路由一致）
- **P2#11**. 外部 API + LLM provider 设置显式 timeout
- **P2#13**. rename/delete 乐观状态失败时给用户可见反馈（不再静默 `catch {}`）
- **P2#14**. `chat_with_rag` 死 docstring + 未使用的 `conversation_id` 参数
- **P2#15**. 非流式 chat/search 死代码（与 #9/#14 关联，需确认无消费者）

待决策（不在本 plan 直接实施）：

- **P2#9**. 前端绕过 REST 路由直连 Supabase → REST 路由成死代码
- **P2#10**. 同步 Supabase client 在 async handler 阻塞 event loop
- **P2#12**. 双 tab / 重试创建重复会话（缺 idempotency key）

## Scope Boundaries

- 不动 P0/P1（已修复并关闭）
- 不在本 plan 做 #9/#10/#12 的实现 —— 它们需要架构决策，先记录待办
- 不引入新的会话功能（搜索/置顶/归档等仍在原 plan scope 之外）
- 不改 `types.ts` / `store.ts` 结构

## Implementation Units

- [ ] **Unit 1: conversation_id UUID 校验（P2#7）**

**Goal:** 畸形 `conversation_id` 返回 422 而非 500

**Files:**
- Modify: `backend/app/schemas.py`（`ChatRequest` / `SearchRequest` 的 `conversation_id: str | None` → `UUID | None`）
- Modify: `backend/app/routers/conversations.py`（PATCH/DELETE 路径参数用 `UUID` 类型或 `Path(...)` 校验）
- Modify/Add: `backend/tests/`（畸形 id 返回 422 的用例）

**Approach:**
- Pydantic 直接用 `uuid.UUID` 类型即可自动校验 + 422；写库前 `str(uuid_val)`
- 注意流式路径（chat/search）也要覆盖，不只 REST 路由

**Verification:** 传 `conversation_id="not-a-uuid"` 到 `/api/ai/chat`、`/api/ai/search`、`PATCH/DELETE /api/conversations/{id}`，全部 422

---

- [ ] **Unit 2: 错误响应契约统一（P2#8）**

**Goal:** 所有后端路由用同一种错误结构，前端 `getJson()` 不再按 endpoint 分支

**Files:**
- Modify: `backend/app/routers/conversations.py`（`HTTPException`→ 统一为现有 `ResponseEnvelope(error=...)` 风格，或反向统一，二选一沿用现状最小改动者）
- Modify: `src/services/ai.ts`（如前端有按 `{detail}` vs `error` 的分支，收敛为一种）
- Modify/Add: 对应后端测试断言错误结构

**Approach:**
- 决策：沿用现有 `ResponseEnvelope`（embeddings 路由已用），把 conversations 路由的 `HTTPException` 包成同结构
- 用 FastAPI exception handler 或显式构造，保持 status code 不变

**Verification:** 触发 404/403/422，响应体结构一致；前端错误提示路径统一

---

- [ ] **Unit 3: 外部 API + LLM provider 超时（P2#11）**

**Goal:** 慢上游不再让 SSE 连接挂数分钟

**Files:**
- Modify: `backend/app/services/external_apis.py`（TMDB/Open Library/iTunes 的 httpx 调用加 `httpx.Timeout(connect=5, read=10)`）
- Modify: `backend/app/llm/providers/*.py`（provider client 显式 `timeout=60`，覆盖 Anthropic SDK 默认 10 分钟）

**Approach:**
- 集中定义超时常量，避免散落魔法数
- 超时异常落入已有的 stream try/except（P1#3 已建）→ yield error 事件

**Verification:** 用 mock/慢端点验证超时按预期触发并产出 error 事件而非长挂

---

- [ ] **Unit 4: rename/delete 失败反馈（P2#13）**

**Goal:** 网络失败不再被静默吞掉，用户看到提示并回滚乐观状态

**Files:**
- Modify: `src/hooks/useConversations.ts`（`renameConversation` / `deleteConversation` 的 `catch` 改为回滚 + 暴露错误）
- Modify: `src/components/AIChatPanel.tsx`（展示错误提示）

**Approach:**
- 乐观更新失败时还原本地状态，并通过现有提示机制（或最小 toast/inline 文案）告知
- 与 P1#2 的 streaming 守卫保持一致，不重复造状态

**Verification:** 断网状态下 rename/delete，UI 回滚 + 有可见反馈

---

- [ ] **Unit 5: 死代码清理（P2#14 + P2#15）**

**Goal:** 删除未使用的非流式分支与骗人 docstring，降低维护面

**Files:**
- Modify: `backend/app/services/rag.py`（删 `chat_with_rag` 未使用的 `conversation_id` 参数 + 重写/删 docstring）
- Modify: `backend/app/routers/chat.py`、`backend/app/routers/search.py`（删非流式分支，若确认无消费者）
- Modify: `backend/app/services/search.py`（`search_with_tools` 非流式变体）
- Modify: `backend/tests/`（删对应 ~250 行死代码测试）

**Approach:**
- ⚠️ 先确认无外部消费者（搜全仓 + 确认前端只用 streaming）再删
- 与 P2#9（前端绕过 REST）决策联动：若决定删 REST 路由，可并入本 unit

**Verification:** 全仓 grep 无残留引用；测试套件绿；流式路径功能不受影响

---

## 待决策（需用户拍板后再开 Unit / 单独 plan）

| 编号 | 议题 | 选项 | 倾向 |
|------|------|------|------|
| P2#9 | 前端绕过 REST 路由 | A. 前端切到 REST 统一契约　B. 删 REST 路由 | 待定（B 更省，但放弃了服务端统一校验入口） |
| P2#10 | 同步 client 阻塞 event loop | A. 迁 AsyncClient　B. 包 `asyncio.to_thread` | B 改动小，A 更彻底 |
| P2#12 | 重复会话幂等 | A. 前端生成 UUID + 后端 upsert　B. idempotency-key 头 | A 顺带解决 #9 的契约方向 |

> #9 与 #10/#12 互相牵连，建议合并成一份「会话写入路径统一」brainstorm 再拍。

## Risks & Dependencies

- Unit 5 删代码有回归风险 → 必须先确认无消费者，单独 commit 便于回滚
- Unit 2 改错误契约会动前端 → 前后端同 PR 改，避免契约错位
- 所有 Unit 不依赖 DB schema 变更（无新 migration）

## Sources & References

- Review 报告：`.context/compound-engineering/ce-review/2026-05-06-multi-conv/REPORT.md`
- 原始 plan：`docs/plans/2026-04-13-001-feat-ai-chat-multi-conversation-plan.md`
