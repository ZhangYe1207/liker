---
title: "Acceptance: feat: Add Python AI backend with LLM integration and RAG"
type: acceptance
status: pending
date: 2026-04-13
plan: docs/plans/2026-03-30-001-feat-ai-backend-upgrade-plan.md
---

# 功能验收清单 — AI Backend Upgrade

对应 Plan: [2026-03-30-001-feat-ai-backend-upgrade-plan.md](../plans/2026-03-30-001-feat-ai-backend-upgrade-plan.md)

## 环境准备

### 0.1 后端环境
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```
编辑 `backend/.env`,至少填:
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET`(Supabase Dashboard → Settings → API)
- `LLM_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`(成本最低)
- `OPENAI_API_KEY`(embedding 必需)

### 0.2 数据库迁移
```bash
supabase db push
```
验证: Supabase Table Editor 能看到 `item_embeddings` 表,`items` 表新增 `review` 列。

### 0.3 启动服务
```bash
# 终端 A
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# 终端 B
npm run dev
```

---

## 验收用例

### Phase 1:基础设施

- [ ] **V1. 后端健康检查** — 访问 `http://localhost:8000/api/health` 返回 200;`/docs` 可见 Swagger。
- [ ] **V2. 后端单元测试** — `cd backend && .venv/bin/python -m pytest tests/ -v` 全绿(health/auth/llm_providers/embedding/rag/search)。
- [ ] **V3. JWT 鉴权拦截** — 无 token 访问 `/api/ai/chat` 返回 401。
  ```bash
  curl -i -X POST http://localhost:8000/api/ai/chat \
    -H "Content-Type: application/json" -d '{"message":"hi"}'
  ```

### Phase 2:数据模型

- [ ] **V4. Review 字段 UI** — 编辑已有条目,评分下方可见 "写下你的评价..." textarea,可填写/保存/回显;留空也能保存。
- [ ] **V5. 新建条目含 Review** — 新增流程填写 review,保存后 Supabase `items` 表 `review` 列有值。

### Phase 3:AI 核心

- [ ] **V6. Embedding 初始化同步** — 收藏 3-5 条(带评分和 review)后执行:
  ```bash
  TOKEN="<supabase-jwt>"
  curl -X POST http://localhost:8000/api/embeddings/sync \
    -H "Authorization: Bearer $TOKEN"
  ```
  Supabase `item_embeddings` 表应有对应行。
  > 获取 JWT:DevTools Console 执行 `(await supabase.auth.getSession()).data.session.access_token`

- [ ] **V7. RAG 品味分析** — 点击侧栏 "✨ AI 助手" → "分析我的口味",流式中文回答,引用实际收藏条目。
- [ ] **V8. 自然语言搜索 + Function Calling** — 输入"帮我找一部像星际穿越的硬科幻电影",流式回答 + 推荐卡片(含封面/年份)。
- [ ] **V9. 个性化推荐** — 点 "推荐一部电影",回答体现基于用户偏好的推理,含结构化卡片。

### Phase 4:前端交互

- [ ] **V10. 一键收藏** — 推荐卡片点 "+ 收藏":加入主列表、按钮变 "已收藏"、重复不会添加。
- [ ] **V11. 错误降级** — 关闭后端后再发 AI 消息:显示错误提示不崩溃;主 CRUD 不受影响。

### Phase 5:文档

- [ ] **V12. README 完整性** — 含架构图、技术栈表、Setup、技术决策表、API 端点表、Future Directions。

---

## 成功标准(对应 Plan SC)

| 标准 | 判断依据 |
|---|---|
| SC1 项目读作 "后端+LLM+RAG" | V1/V2/V7/V8 全绿 |
| SC2 可深入讲解 | 能口述 provider 抽象、RAG、function calling、SSE |
| SC3 真实可用 | V7/V8/V9 结果合理 |
| SC4 README 完整 | V12 通过 |

---

## 常见坑位

- **JWT 获取**:DevTools Console `(await supabase.auth.getSession()).data.session.access_token`
- **Embedding 失败**:确认 `OPENAI_API_KEY` 有效且有余额
- **pgvector 未启用**:Supabase → Database → Extensions 启用 `vector`
- **CORS 报错**:后端 `.env` 的 `CORS_ORIGINS` 包含 `http://localhost:5173`

---

## 建议验收顺序

V1 → V2 → V4 → V5 → V6 → V7 → V8 → V9 → V10 → V11 → V3 → V12

优先跑通最有"成就感"的 RAG 流程,最后补环境边界与文档。
