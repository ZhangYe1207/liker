# Code Review — AI Chat 多会话持久化

**Scope:** plan `2026-04-13-001-feat-ai-chat-multi-conversation` 涉及的 commits（`08631c9..HEAD`）
**Files:** 28 文件 / +3432 / -221
**Mode:** standalone（branch `feat/ai-backend`，PR #6 → main）
**Reviewers:** 14 个并行 agent（6 always-on + 5 cross-cutting + 3 stack-specific）

**Verdict: NOT READY** — 至少 1 个 P0 跨租户漏洞 + 多个 P1 reliability/race。建议在合并 PR 前先把 P0/P1 修掉。

---

## 2026-05-08 修复进度（/ce:work 第二轮）

| 编号 | 状态 | 修复 commit |
|------|------|-------------|
| P0 #1 IDOR | ✅ FIXED | `fdaa92c` ensure_conversation 加 ownership 校验 |
| P1 #2 SSE 流污染 | ✅ FIXED | AbortController + activeIdRef 守卫 + streaming 期间禁用 select/delete/rename |
| P1 #3 流中断错误处理 | ✅ FIXED | rag/search 流外层 try/except → yield error 事件 → 写 sentinel assistant 防孤儿 |
| P1 #4 全表扫描 | ✅ FIXED | 新增 `get_items_by_ids` + RAG/Search collection 改 `.in_(ids)` |
| P1 #5 history 无 LIMIT | ✅ FIXED | list_messages 支持 limit + load_history 用 `LLM_HISTORY_WINDOW=40` |
| P2 #6 title 长度 | ✅ FIXED | Pydantic `max_length=100` + migration 006 DB CHECK |

**剩余 P2/P3 未修**（按 review 报告原顺序）：
- P2 #7 conversation_id UUID 校验
- P2 #8 错误响应契约不统一
- P2 #9 前端绕过 REST 路由（架构决策）
- P2 #10 同步 client 阻塞 event loop（架构决策）
- P2 #11 外部 API + LLM provider timeout
- P2 #12 双 tab 重复会话（产品决策）
- P2 #13 乐观状态回滚 — P1 #2 顺带改善了 placeholder 清理
- P2 #14 chat_with_rag dead docstring
- P2 #15 非流式 chat/search 是死代码（架构决策）
- 全部 P3 polish

P0/P1 全部清零，可以重新关闭 plan。剩余 P2 走 follow-up plan 跟踪。

---

## P0 — Critical

### 1. IDOR：`/api/ai/chat` 和 `/api/ai/search` 不校验 conversation_id 所有权

**File:** `backend/app/services/conversation_helpers.py:43-60` (`ensure_conversation`)
**Reviewers:** security (0.95), correctness (0.95), testing (0.90), reliability (0.7)

`ensure_conversation` 收到非空 `conversation_id` 时直接返回 `(conversation_id, False)`，不做 `get_conversation` 所有权校验。后端用 service role key 绕过 RLS，所以攻击者只要把别人的 `conversation_id` 塞进 `/api/ai/chat` 或 `/api/ai/search`，就能：

1. 把自己的消息写进受害者会话（`persist_user_message`）
2. 让 LLM 读取受害者历史并通过流式回包间接泄漏内容（`load_history`）
3. 把 LLM 回复写进受害者会话历史（`persist_assistant_message`）

`/api/conversations` REST 路由有 `get_conversation` 校验，**只有 chat/search 流式路径漏了**——契约不一致。

**测试反向加固了这个 bug**：`test_conversation_helpers.py::TestEnsureConversation::test_existing_id_returns_as_is` 主动断言「传入 id 原样返回」。

**Fix:**
```python
async def ensure_conversation(client, user_id, conversation_id, first_message):
    if conversation_id:
        existing = await get_conversation(client, user_id, conversation_id)
        if existing is None:
            raise PermissionError("conversation not found")  # 或抛 404
        return conversation_id, False
    # ...
```
同时新增测试：用户 A 创建会话 X，用户 B 拿 X 的 id 调 `/api/ai/chat` → 应 4xx，messages 表无新行。

**Owner:** review-fixer | **Verification required:** yes

---

## P1 — High Impact

### 2. 切换/删除会话期间 SSE 流污染目标会话

**Files:** `src/hooks/useConversations.ts:54-238`、`src/services/ai.ts:41-128`
**Reviewers:** correctness (0.88), kieran-ts (0.82+0.78), julik-races (0.95+0.85+0.9), reliability (0.85)

多 reviewer 一致指出：

- `streamingRef` 只挡「再次发送」，不挡 `selectConversation` / `deleteConversation` / 组件 unmount
- AIChatPanel 标题栏下拉只 `disabled={!accessToken}`，**streaming 期间用户可任意切换**
- SSE `content` 事件的 `setMessages(prev => { updated[updated.length-1] = ... })` 没用 `liveId === currentActiveId` 守卫，会把 A 的 token 写进 B 的最后一条消息
- `streamChat`/`streamSearch` 没接 `AbortController`：unmount 后 setState 会触发 React warning，且后端继续生成 token、继续计 LLM 费用
- 删除当前流式会话会让流写到已删除行，FK 触发 500

**Fix（一组）：**
1. `streamChat`/`streamSearch` 接 `AbortSignal`，从 hook 顶层一个 `controllerRef` 注入
2. `selectConversation`/`deleteConversation`/`newConversation`/`useEffect cleanup` 调 `controllerRef.current?.abort()`
3. SSE 循环加守卫：`if (liveId !== activeIdRef.current) return prev`
4. 标题栏下拉、删除按钮在 `streaming === true` 时 `disabled`

**Owner:** review-fixer | **Verification required:** yes

---

### 3. 流中断时后端只写一半，前端无错误事件，状态错乱

**Files:** `backend/app/routers/chat.py:42`、`services/rag.py:160-185`、`services/search.py:255-330`、`src/hooks/useConversations.ts:196-203`
**Reviewers:** correctness (0.78), testing (0.85), reliability (0.9+0.85), kieran-python (0.68)

- 后端：`async for chunk in stream` 没 try/except。Provider 抛错 → `persist_user_message` 已写入、`persist_assistant_message` 不再执行 → DB 留下「孤儿用户提问」。下一次 `load_history` 把孤儿提问当上下文喂给 LLM。
- 后端 `event_generator` 不发 `{type:'error', ...}`，FastAPI 直接把响应关掉。
- 前端 `parseSSE` 看到 `done:true` 才认作正常结束；**`reader.read()` 直接 `done:true` 退出 = 静默成功**。catch 不触发，错误不上报；assistant 占位符永远停在 UI。
- 前端 catch 用 `prev.filter(m => m.role==='assistant' && !m.content)` 兜底，会**误删历史里所有空 assistant 行**。
- 前端乐观插入的会话行 + 乐观 user 消息 + activeId 都没回滚。

**Fix:**
- 后端流外层 try/except → yield `{type:'error', message:str(exc)}` → 在 finally 里 best-effort 写一个 sentinel assistant 消息（或显式删除孤儿 user message）。
- 前端：把 placeholder 用 ref 记住索引，catch 里精准删除；catch 末尾调 `listConversations()` 重新对账。

**Owner:** review-fixer | **Verification required:** yes

---

### 4. RAG/Search 每次对话都全表扫描用户 items

**Files:** `backend/app/services/rag.py:47-57`、`services/search.py:88`
**Reviewer:** performance (0.88)

`retrieve_context` 调 `get_user_items(db_client, user_id)` 加载**用户所有 items + categories join**，只为查 10 条 vector 命中的 id。每条 chat 消息都会跑一次。1k items 的用户 = 每轮都拉 1k 行。

**Fix:**
```python
ids = [m['item_id'] for m in matches]
result = (
    client.table('items')
    .select('*, categories(name, icon)')
    .in_('id', ids)
    .eq('user_id', user_id)
    .execute()
)
```
`search.py:execute_search_collection` 同样的 pattern。

**Owner:** review-fixer | **Verification required:** yes（建议加一个 1k items 用户的回归测试）

---

### 5. `load_history` 无 LIMIT — 长对话会撑爆 LLM 上下文 + O(N²) 流量

**File:** `backend/app/services/conversation_helpers.py:63`、`db/conversations.py:93-106`
**Reviewers:** performance (0.85), correctness (0.65)

每轮调用 `list_messages(client, conversation_id)` 不限条数，结果整段塞进 LLM。N 轮对话总流量 O(N²)，且会触发 provider context window 限制。

**Fix:** `list_messages` 加 `limit(K)`（如 50）+ `order('created_at', desc=True).reverse()`，或后续做滚动摘要。

**Owner:** human（产品决策：截断窗口大小？滚动摘要？）| **Verification required:** yes

---

## P2 — Should Fix

### 6. Title 没长度限制（DoS via 多 MB 字符串）

`backend/app/schemas.py:43-45`、`migrations/005_add_ai_conversations.sql:11`
**Fix:** `title: str = Field(min_length=1, max_length=100)` + DB `CHECK (char_length(title) <= 100)`。
**Reviewers:** security (0.85), data-migrations (0.75) | **Owner:** review-fixer

### 7. `conversation_id` 不验证 UUID 格式 → 畸形输入触发 500

`schemas.py` ChatRequest/SearchRequest 用 `str | None`，PATCH/DELETE 路径参数同。
**Fix:** 改 `UUID | None` 或 `Path(..., regex=UUID_RE)`。
**Reviewers:** security (0.80), api-contract (0.72) | **Owner:** review-fixer

### 8. 错误响应契约不统一：`/api/conversations` 用 `{detail}`，其它路由用 `ResponseEnvelope.error`

`backend/app/routers/conversations.py` 抛 `HTTPException`（默认 `{detail}`），但 embeddings 路由返回 `ResponseEnvelope(error=...)`。前端 `getJson()` 必须按 endpoint 分支处理。
**Fix:** 选定一个标准（建议沿用现有 `ResponseEnvelope`）→ 调整 conversations 路由。
**Reviewer:** api-contract (0.88) | **Owner:** review-fixer

### 9. 前端绕过新 REST 路由直连 Supabase，REST 路由是死代码

`src/data/supabase.ts:215-254` 的 list/messages/rename/delete 都直接走 Supabase client（依赖 RLS）。新 `/api/conversations` 路由没有任何前端调用方，但仍要维护 + 测试。
**Fix:** 二选一。要么前端切到 REST（统一契约），要么删掉 REST 路由。
**Reviewers:** api-contract (0.90), maintainability | **Owner:** human（架构决策）

### 10. 同步 Supabase client 在 async handler 里阻塞 event loop

`backend/app/db/conversations.py` 全部 `async def`，但底层 `client.table(...).execute()` 是同步 httpx。一次 chat turn ≥ 3 个阻塞 round-trip，并发请求会串行。
**Reviewer:** performance (0.82) | **Owner:** human（迁移到 AsyncClient 或包 `asyncio.to_thread`）

### 11. 外部 API（TMDB/Open Library/iTunes）和 LLM provider 都没设 timeout

`backend/app/services/external_apis.py`、`backend/app/llm/providers/claude.py`。Anthropic SDK 默认 10 分钟超时。慢 API 会让 SSE 连接挂超长时间。
**Fix:** `httpx.Timeout(connect=5, read=10, ...)`；provider client 显式 `timeout=60`。
**Reviewer:** reliability (0.95+0.8) | **Owner:** review-fixer

### 12. 双 tab/重试可创建重复会话

`ensure_conversation` 没有 idempotency key。`streamingRef` 只防同 tab 双发。
**Fix:** 让前端生成 conversation_id（client-side UUID），后端 upsert；或加 idempotency-key 头。
**Reviewer:** reliability (0.85) | **Owner:** human

### 13. 失败时的乐观状态没有完整回滚

参见 P1#3。`renameConversation` / `deleteConversation` 网络失败被 `catch {}` 静默吞掉，用户看不到提示。
**Reviewers:** correctness (0.72), kieran-ts (0.66), julik-races (0.85), reliability (0.85)

### 14. `chat_with_rag` 文档写了一堆持久化逻辑，函数体根本没实现

`backend/app/services/rag.py:103-137`。函数签名收 `conversation_id` 参数，但函数体压根没读这个参数。文档完全骗人。
**Fix:** 删掉未使用的 `conversation_id` 参数，重写 docstring 表明这是非持久化变体；或干脆删掉 dead 非流式路径（见 #15）。
**Reviewer:** kieran-python (0.88) | **Owner:** review-fixer

### 15. 非流式 chat/search 分支是死代码

`routers/chat.py:58-68` / `routers/search.py:57-71`：注释自承「intentionally bypassed by the UI」，前端只用 streaming，但仍维护 250 行测试。
**Fix:** 删除非流式分支 + `chat_with_rag` / `search_with_tools` + 对应测试。
**Reviewer:** maintainability (0.85) | **Owner:** human（确认无外部消费者后再删）

---

## P3 — Polish

- **`useConversations.deleteConversation` 在 setState updater 里调 `selectConversation`**（impure updater，StrictMode 下双触发）— `useConversations.ts:220-238`，**safe_auto** 修复
- **`renameConversation` 只 merge `title`**，丢掉 server 返回的 `updatedAt` → 下拉「X 分钟前」标签变陈旧 — `useConversations.ts:208-218`
- **`ConversationOut` / `MessageOut` Pydantic schema 定义但从未用作 `response_model`** — schemas.py:24-40
- **`SearchResult` interface 导出但无消费者** — `src/services/ai.ts:22-27`
- **`ChatMessage.id` 字段定义但 UI 用 `key={i}` 渲染** — 字段是装饰性的
- **`isSearchIntent` 用 substring 匹配「推荐/找/搜索」做路由** — 「找」是极常见动词，应改名 `matchesSearchKeyword` 或服务端统一判断
- **后端 `db_client: object` 弱类型** — `services/search.py` 里 5 个函数，应该是 `supabase.Client`
- **Messages ordering 只按 created_at 无 tiebreaker** — `migrations/005`
- **`title` 截断没有 ellipsis**，`_title_from_message` 直接 `cleaned[:20]`
- **没有 `POST /api/conversations`** — agent 无法预创建空会话；只能通过 LLM 调用懒创建（agent-native parity 警告）

---

## Coverage / 测试缺口

- `useConversations` hook（253 行复杂状态机）**0 个测试** — 项目无 vitest/jest 配置
- 后端 streaming failure path（provider 抛错、persist_assistant_message 抛错）零覆盖
- 跨租户 conversation_id 测试缺失（且现有测试反向加固了 IDOR 行为）
- 切换/删除会话期间流处理的 race 测试缺失
- 长对话上下文边界测试缺失
- RLS 在测试中不生效（service role），无端到端 anon-key 测试

---

## 已通过的部分

- Brainstorm + Plan + Acceptance 三件套齐全且命名合规（CLAUDE.md 标准）
- `types.ts` 改动克制（仅新增 `Conversation` 接口）
- `/api/conversations` REST 路由本身的所有权校验完整（`get_conversation` 防越权）
- RLS policy 在 005 migration 里 SELECT/INSERT/UPDATE/DELETE 全覆盖
- 前端 `key={i}` 渲染消息内容走 JSX 文本节点 → XSS 已防
- DataLayer 抽象（localStorage / supabase 两侧 listConversations 等方法对齐）
- JWT auth 算法允许列表 pin 死，无 algorithm confusion
- 索引 `idx_conversations_user_id_updated_at`、`idx_messages_conversation_id_created_at` 合理
- 无 `docs/solutions/` 历史教训需要参考

---

## 建议执行顺序

1. **P0 必修**: ensure_conversation 加 ownership 校验 + 配套测试
2. **P1 必修**: AbortController + 流污染守卫 + 流错误事件 + 前端对账
3. **P1 必修**: rag/search 改 `.in_(id, ids)` 替代全表 + load_history 加窗口
4. **P2 一批**: title/UUID 验证、错误契约统一、provider timeout
5. **P3 / 架构**: REST vs 直连 Supabase 二选一、删除死路径、引入 vitest

---

*生成于 2026-05-06，基于 14 个 reviewer agent 的合并结果，confidence ≥ 0.60 已被收录。*
