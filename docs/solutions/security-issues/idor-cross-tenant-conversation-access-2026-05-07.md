---
title: "IDOR 跨租户访问：service-role key 路径下未校验 conversation_id 所有权"
date: 2026-05-07
category: security-issues
module: backend/app/services/conversation_helpers
problem_type: security_issue
component: service_object
symptoms:
  - "ensure_conversation 接受调用方传入的 conversation_id 后原样返回，未校验所有权"
  - "后端使用 Supabase service-role key 绕过 RLS，攻击者传入受害者 UUID 即可向受害者会话写入消息并读出多轮历史"
  - "/api/ai/chat 与 /api/ai/search 流式路径同时受影响"
  - "原有测试 test_existing_id_returns_as_is 主动断言「输入什么就返回什么」，把漏洞行为编码进契约"
root_cause: missing_permission
resolution_type: code_fix
severity: critical
related_components:
  - authentication
  - database
tags:
  - idor
  - cross-tenant
  - service-role-key
  - rls-bypass
  - supabase
  - fastapi
  - authorization
  - sse
---

# IDOR 跨租户访问：service-role key 路径下未校验 conversation_id 所有权

## Problem

`backend/app/services/conversation_helpers.py::ensure_conversation` 接受调用方传入的任意 `conversation_id` 并原样返回，未校验所有权。后端使用 Supabase **service-role key**（绕过 RLS），导致攻击者只要拿到任意 UUID 即可向受害者的会话写入消息并通过流式响应回读历史。Discovery source: `.context/compound-engineering/ce-review/2026-05-06-multi-conv/REPORT.md` (P0 #1)。

## Symptoms

- 攻击者向 `/api/ai/chat` 或 `/api/ai/search` 传入受害者的 `conversation_id`，请求成功，自己的消息和 LLM 回复被写入受害者会话；下次受害者打开该会话即可看到 attacker 的消息（污染 + 信息泄露）。
- 每次后续调用 `load_history` 都把受害者的多轮上下文喂给攻击者的 LLM 流式响应，等同于历史外泄。
- 现有测试套件 PASS，CI 无任何报警 —— 这恰恰是问题的一部分（见下）。
- `/api/conversations` REST 路由有 `get_conversation` 校验，但 chat/search 流式路径漏了 —— 同一 trust boundary 上契约不一致。

## What Didn't Work — 假性自信测试反模式

老测试 `test_existing_id_returns_as_is` 形式上是「绿的」：

```python
async def test_existing_id_returns_as_is():
    conv_id, is_new = await ensure_conversation(client, USER, "any-id", "hi")
    assert conv_id == "any-id"  # 不验证所有权 —— 把跨租户访问当成 feature
```

它只断言「输入什么就吐什么」，从未触发任何 DB 校验，把「不做检查」固化成契约。**绿色测试 ≠ 安全**：当 happy-path 测试只覆盖 ID 透传、不覆盖「ID 属于他人」分支时，它给出的是负向信号 —— 任何想加 ownership check 的人都会被这个测试挡回去。

## Solution

**Before** (`backend/app/services/conversation_helpers.py`)
```python
async def ensure_conversation(client, user_id, conversation_id, first_user_message):
    if conversation_id:
        return conversation_id, False  # ← IDOR：从不校验所有权
    row = await create_conversation(client, user_id, _title_from_message(first_user_message))
    return row["id"], True
```

**After**
```python
class ConversationNotFoundError(Exception):
    """Caller passed a conversation_id that the current user does not own."""

async def ensure_conversation(client, user_id, conversation_id, first_user_message):
    if conversation_id:
        existing = await get_conversation(client, user_id, conversation_id)  # WHERE user_id = ?
        if existing is None:
            raise ConversationNotFoundError(conversation_id)
        return conversation_id, False
    row = await create_conversation(client, user_id, _title_from_message(first_user_message))
    return row["id"], True
```

**SSE 错误事件契约**（`rag.py::chat_with_rag_persistent` 与 `search.py::search_with_tools_persistent` 同款，DB 写入永远跑不到）

```python
try:
    conv_id, is_new = await ensure_conversation(db_client, user_id, conversation_id, message)
except ConversationNotFoundError:
    yield {"type": "error", "code": "conversation_not_found", "message": "会话不存在或无权访问"}
    return  # ← 关键：早退，跳过 persist_user_message / chat_provider.chat / persist_assistant_message
```

**配套测试**（`backend/tests/test_conversation_helpers.py`）

- `test_existing_id_returns_when_owned` —— mock `get_conversation` 返回行，断言成功
- `test_existing_id_raises_when_not_owned` —— mock `get_conversation` 返回 `None`，断言 `ConversationNotFoundError`
- `TestCrossTenantGuards::test_chat_emits_error_event_for_unowned_conversation` —— 集成断言：error 事件 + 零 DB 写入 + 零 LLM 调用
- `TestCrossTenantGuards::test_search_emits_error_event_for_unowned_conversation` —— 同上，覆盖 search 流

## Why This Works

根因是**信任边界搬家了**：service-role key 绕开 Postgres RLS 策略，原本由 RLS 强制的 `auth.uid() = user_id` 等价物在 Python 进程里**没有自动接力**。RLS 不是「也开着的安全网」，它在 service-role 路径下是**关掉的**。所以每个接受用户输入的资源 ID 的服务端入口，都必须显式做 `WHERE user_id = ?` 这一刀；这一刀做完，跨租户路径连 `persist_user_message` 都到不了，写入和回读双向被切。

## Prevention

1. **service-role 守则**：任何使用 service-role key 的 handler，只要参数里有用户提供的资源 ID（`conversation_id` / `item_id` / `category_id` / ...），必须在第一行调一个 `get_<resource>(client, user_id, id)` 形态的 owner-scoped 查询，命中失败即 raise → 转成 4xx 或 SSE error 事件。
2. **测试配对原则**：每写一个「resource-id happy-path」测试，必须配一个 `*_when_not_owned` 的负例（参考 `test_existing_id_raises_when_not_owned` + `TestCrossTenantGuards`），断言三件事：(a) 抛错或产出 error 事件；(b) **零 DB 写入**；(c) **零 LLM 调用**。仅断言「输入透传」的测试是反模式，会把漏洞固化成契约。
3. **审计 grep**：定期扫描 service-role 路径上的「光裸 eq」，检查是否漏掉 `user_id`：
   ```bash
   rg -nP "client\.table\([^)]*\)\.[^.]*eq\((?!.*user_id)" backend/app/db
   rg -n "create_client.*SUPABASE_SERVICE_ROLE_KEY" backend/app
   ```
4. **流式端点 error 事件契约**：统一用 `{"type":"error","code":"<machine_code>","message":"<human_zh>"}`，前端按 `code` 分支处理（`conversation_not_found` / `rate_limited` / `provider_error` ...）。`return` 必须紧跟 yield，禁止「先 yield error 再继续 persist」的半截写法。
5. **流程闸**：plan 关闭前必须把对应的 `/ce:review` 报告里 P0/P1 全部 close。本次 plan `2026-04-13-001-feat-ai-chat-multi-conversation` 在 P0 未修的情况下被标 completed（commit `6dc3cd3`），属于流程漏洞，acceptance-tests 清单未来应增加「review-findings-resolved」一项。

## Related Issues

- 发现来源：`.context/compound-engineering/ce-review/2026-05-06-multi-conv/REPORT.md`（P0 #1）
- Plan：`docs/plans/2026-04-13-001-feat-ai-chat-multi-conversation-plan.md`
- 修复 commit：`fdaa92c` (`fix(backend): enforce conversation ownership in ensure_conversation`)
- 同 review 内未修复的关联项（候选下一轮工作）：P1 SSE 流污染 race（`useConversations.ts` + `ai.ts` AbortController）、P1 `load_history` 无 LIMIT、P1 `retrieve_context` 全表扫描、P2 title/UUID 长度校验、P2 provider timeout
