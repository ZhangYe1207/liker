---
title: "Acceptance: feat: AI Chat 多会话持久化"
type: acceptance
status: pending
date: 2026-04-13
plan: docs/plans/2026-04-13-001-feat-ai-chat-multi-conversation-plan.md
---

# 功能验收清单 — AI Chat 多会话持久化

对应 Plan: [2026-04-13-001-feat-ai-chat-multi-conversation-plan.md](../plans/2026-04-13-001-feat-ai-chat-multi-conversation-plan.md)

对应 Brainstorm: [2026-04-13-ai-chat-multi-conversation-requirements.md](../brainstorms/2026-04-13-ai-chat-multi-conversation-requirements.md)

## 环境准备

### 0.1 数据库迁移
```bash
# 方式 A：Supabase CLI
supabase db push

# 方式 B：Supabase Dashboard → SQL Editor
# 粘贴执行 supabase/migrations/005_add_ai_conversations.sql 内容
```

验证：Supabase Table Editor 能看到 `conversations` / `messages` 两张新表，RLS 均已开启。

### 0.2 后端启动
```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### 0.3 前端启动
```bash
npm run dev
```

### 0.4 获取 JWT（用于 curl 验收）
浏览器 DevTools Console：
```js
(await supabase.auth.getSession()).data.session.access_token
```

---

## 验收用例

### Phase 1：DB + 后端

- [ ] **V1. 迁移可执行** — `supabase/migrations/005_add_ai_conversations.sql` 顺利执行，无报错；重跑幂等（或与现有 migration 风格一致）。

- [ ] **V2. RLS 四件套齐全** — Supabase Dashboard → Authentication → Policies 下，`conversations` 和 `messages` 各有 4 条 policy（select/insert/update/delete），`TO authenticated`。

- [ ] **V3. 触发器 bump updated_at** — 直接 SQL 插入一条 message，对应 `conversations.updated_at` 被更新：
  ```sql
  INSERT INTO conversations (user_id, title) VALUES ('<uid>', 'test') RETURNING id;
  -- 记住 id
  SELECT updated_at FROM conversations WHERE id='<id>';
  INSERT INTO messages (conversation_id, role, content) VALUES ('<id>', 'user', 'hi');
  SELECT updated_at FROM conversations WHERE id='<id>';  -- 应更新
  ```

- [ ] **V4. 后端 DB 层测试** — `cd backend && .venv/bin/python -m pytest tests/test_conversations_db.py -v` 全绿。涵盖：
  - `list/create/update/delete_conversation` 都做 `user_id` 过滤
  - `insert_message` 正确存 `recommendations` jsonb
  - `delete_conversation` 触发 CASCADE 清理 messages（集成 mock 断言）

- [ ] **V5. 后端 Router 测试** — `pytest tests/test_conversations_router.py -v` 全绿：
  - 未登录 GET `/api/conversations` → 401/403
  - 登录 GET → 200 返回当前用户对话
  - PATCH 他人对话 → 404（不泄露存在性）
  - DELETE 不存在 → 404

- [ ] **V6. RAG/Search 服务测试** — `pytest tests/test_rag_service.py tests/test_search_service.py -v` 全绿。新增 case：
  - `conversation_id=None` → 不查不写 DB（旧路径）
  - `conversation_id=None` + 首条消息 → 懒创建，title 取前 20 字
  - 历史消息正确加入 LLM messages 数组
  - SSE 事件顺序：`conversation`（若新建）→ `recommendations`（search only）→ `content × N` → `done`
  - 流完 INSERT assistant message，recommendations 字段非空（search case）

- [ ] **V7. curl 手动验证 conversations API** —
  ```bash
  # 列表
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/conversations
  # 重命名
  curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"title":"重命名测试"}' http://localhost:8000/api/conversations/<id>
  # 删除
  curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/conversations/<id>
  ```

- [ ] **V8. curl 手动验证 chat 懒创建** —
  ```bash
  curl -N -X POST http://localhost:8000/api/ai/chat \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"message":"你好","conversation_id":null}'
  ```
  首个 SSE 事件应为 `data: {"type":"conversation","id":"..."}`；Supabase 能看到新对话 + 两条 message（user + assistant）。

### Phase 2：前端 DataLayer 与 Hook

- [ ] **V9. TypeScript 编译** — `npx tsc --noEmit` 无新增错误；`src/types.ts` 有 `Conversation` 类型；`ChatMessage` 扩展为含 `id?` / `recommendations?`。

- [ ] **V10. DataLayer Supabase 实现** — 登录用户 A，浏览器 Console 调 `dataLayer.listConversations()`，只返回 A 的对话（RLS 隔离验证）。

- [ ] **V11. DataLayer LocalStorage 抛错** — 未登录态下调用上述方法 → 抛出 "AI chat 需要登录"（或等价信息）。

- [ ] **V12. useConversations 挂载行为** —
  - 初次登录（库中无对话）→ activeId = null，显示欢迎态
  - 刷新（库中 ≥1 对话）→ 自动选中 updated_at 最新的那条，messages 从后端加载完整

### Phase 3：端到端 UI

#### R1：持久化

- [ ] **V13. 关闭面板再打开** — 发 2-3 条消息 → 点 × 关闭面板 → 侧栏 AI 按钮重开 → 上次对话 + 全部消息原样出现。

- [ ] **V14. 硬刷新（F5）** — 在对话中按 F5 → 页面重新加载 → AI 面板重开后仍在同一对话、历史消息完整。

- [ ] **V15. 退出浏览器** — 关闭所有窗口 → 重新打开 → 登录态 → 打开 AI 面板 → 对话仍在。

#### R2：默认恢复最近活跃

- [ ] **V16. 最近活跃优先** — 建立 3 条对话 A/B/C，最后一次在 B 里发消息 → 重开面板 → 自动进入 B（而非 A 或 C）。

- [ ] **V17. 空态兜底** — 数据库中全部对话删除后重开面板 → 显示欢迎页（含 quick action 按钮）。

#### R3 + R4：标题栏下拉 + 切换 / 重命名 / 删除

- [ ] **V18. 下拉列表展开** — 点击标题（非 × 按钮）→ 下拉出现；列表按 updated_at DESC 排序；每行展示 title + 相对时间（如「2 分钟前」）。

- [ ] **V19. 切换对话** — 下拉内点另一条 → 主消息区切到该对话、其他对话不受影响、标题栏显示新 title；下拉自动收起。

- [ ] **V20. 行内重命名** — 下拉中某行点「编辑」图标 → title 变输入框 → 输入「电影 2026 春」→ Enter 提交 → UI 立即更新 → 刷新页面 → 下拉里仍是「电影 2026 春」。

- [ ] **V21. 重命名取消** — 编辑中按 Esc → 还原为原标题，不触发 PATCH。

- [ ] **V22. 删除 + 二次确认** — 点某行「删除」→ 出现 `confirm` 对话框 → 取消 → 不删；再次点删除 → 确认 → 对话从下拉消失，后端 `conversations` 表对应行不存在（CASCADE 清理 messages）。

- [ ] **V23. 删除当前对话自动切换** — 删除正在查看的那条 → 下拉消失该条 → 主消息区自动切到剩余最近活跃对话；若删完最后一条 → 切回欢迎态。

#### R5 + R6：懒创建 + 首条消息作标题

- [ ] **V24. 「新建会话」纯本地** — 下拉内点「+ 新建会话」→ 消息区清空进入空态；此刻 Supabase `conversations` 表行数不变。

- [ ] **V25. 首条消息触发落库** — 在新建后空态下发送「推荐一部科幻电影」→ 后端懒创建行 → 下拉新增一条，title = 「推荐一部科幻电影」（前 20 字）。

- [ ] **V26. 长标题截断** — 发送一条 50+ 字的用户消息 → 对话 title 恰好前 20 字。

- [ ] **V27. Quick action 作标题** — 空态直接点「分析我的口味」→ 新对话 title = 「分析一下我的品味偏好」（quick action 预置文案前 20 字，无特殊路径）。

#### R7：推荐卡片持久化

- [ ] **V28. 推荐随消息保存** — 发「推荐一部悬疑电影」→ 看到推荐卡片 → 关面板 → 重开该对话 → 卡片仍在，展示位置绑定到那条 assistant 消息（不是面板级单例）。

- [ ] **V29. 「+ 收藏」可用** — 重开的对话中，旧推荐卡片的「+ 收藏」按钮点击 → 正常唤起 AddEditModal 并填充 title / description。

- [ ] **V30. 多条推荐消息并存** — 同一对话中连发两次推荐请求 → 各自的 assistant 消息挂各自的推荐卡片，互不覆盖（不再有 `setRecommendations([])` 清空 bug）。

#### R8：按时间加载历史

- [ ] **V31. 消息时序正确** — 重开老对话 → 消息按时间升序（最早在顶部），user/assistant 交替符合发生顺序。

- [ ] **V32. 多轮连续性** — 对老对话追问「上一条里提到的 X 详细说说」→ LLM 回答体现记得上文（说明后端把历史回灌到 LLM messages）。

### Phase 4：边界与降级

- [ ] **V33. 流式中途关面板** — 发消息过程中（正在流）点 × → 再打开面板 → 已经产生的 assistant 内容应在对话里（若后端完成了 INSERT）；若中断导致 assistant 缺失，最多只见 user 消息（不崩溃、不重复）。

- [ ] **V34. 网络中断** — 发消息后断网 → UI 显示错误，user message 仍保留在视觉上；重连后刷新 → 若后端已入库则 user message 持久，若未完成则列表里无此对话或无此消息（与后端实际状态一致）。

- [ ] **V35. 未登录态** — 退出登录后点侧栏 AI → 欢迎态 + 登录提示；或下拉按钮禁用（行为需前端团队一锤定音，但不应崩溃）。

- [ ] **V36. 跨用户隔离** — 用户 A 建 1 条对话 → 用户 B 登录 → 下拉列表不含 A 的对话；用户 B 直接访问 A 的 `conversation_id` URL（如有）→ 404。

- [ ] **V37. 同账号多标签同步一致性（非 MVP，仅记录现象）** — 标签 1 建对话 → 标签 2 的下拉需手动刷新才能看到（已声明不做实时订阅，属预期行为）。

---

## 与 Plan Success Criteria 的对应关系

| Plan 中的验收判据 | 验收用例 |
|---|---|
| 发几条消息 → 关面板 → 重开 → 对话与消息原样出现 | V13, V14, V15 |
| 硬刷新 → 对话仍在 | V14 |
| 新建 3 条对话 → 下拉列出 3 条 → 点击切换 | V18, V19 |
| 推荐卡片关面板重开仍在，「+ 收藏」可用 | V28, V29 |
| 重命名刷新后保持 | V20 |
| 删除 → 下拉移除；若删当前则切换 | V22, V23 |
| 最近活跃自动恢复 | V16 |
| 懒创建 + 首条消息作标题 | V24, V25, V26 |
| 多轮连续性 | V32 |

## 常见坑位

- **Service-role key 越权**：后端新 DB 函数忘写 `.eq('user_id', user_id)` → 不同用户能读彼此对话。V4 的测试必须显式断言每个函数都做了这个过滤。
- **SSE 事件顺序**：`{type: "conversation"}` 必须先于 `{type: "recommendations"}` 和 `{type: "content"}`，否则前端还没 setActiveId 就开始 append message，导致 message 落不到任何对话。V6 / V8 重点看事件顺序。
- **消息 vs 面板级 recommendations**：改造前 `recommendations` 是 `AIChatPanel` 级单例，重构后必须绑定到 assistant message；V30 专查这个历史 bug。
- **updated_at 触发器**：如果忘记写 `messages INSERT → bump conversations.updated_at`，下拉排序永远不变（最近活跃失效）。V3 + V16 联合验证。
- **quick action 路径**：brainstorm 里明确 quick action = user message，不走特殊逻辑；V27 防止实现时"聪明地"过滤掉 quick action 导致新对话无标题。
- **history 回灌**：RAG 当前实现把最后一条 user 消息用 RAG context 增强；多轮时要用 history `[:-1]` + context-augmented user，不能直接 `[...history, user_with_context]` 导致 user 被重复。V6 + V32 覆盖。
- **删除当前对话**：`DELETE` 成功后前端 state 若不主动切到 conversations[0]，活跃态会悬空指向已删 id，后续拉消息 404。V23 专查。
- **Vite Fast Refresh**：新增 `useConversations` hook 若和 component 放同一文件 → 又会触发 page reload。hook 必须独立文件（`src/hooks/useConversations.ts`），与本次修复 `useAuth` 的经验一致。
