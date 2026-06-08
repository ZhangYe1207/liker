---
title: "MiniMax embedding 接入：维度、db/query 双向量空间、1002 限流、32-batch、600 字截断"
date: 2026-04-20
category: integration-issues
module: backend/app/llm/embedding
problem_type: integration_issue
component: service_object
symptoms:
  - "首次接入按 OpenAI 兼容协议调用，请求 200 但 response 解不出 embeddings 字段"
  - "存储维度按文档默认值 1024 写入 pgvector，实际返回 1536，导致后续维度不匹配 SQL 报错"
  - "RAG 检索召回率几乎为 0：写入用 db 空间、查询也用 db 空间，但官方推荐 query 走单独空间"
  - "批量同步全量 items 时被 status_code=1002 限流，整个 sync job 失败"
  - "单条 description 过长触发 token 限制返回错误，零部分恢复"
root_cause: wrong_api
resolution_type: code_fix
severity: high
related_components:
  - database
  - tooling
tags:
  - minimax
  - embedding
  - pgvector
  - rag
  - rate-limit
  - api-integration
  - batching
---

# MiniMax embedding 接入：维度、db/query 双向量空间、1002 限流、32-batch、600 字截断

## Problem

把 embedding provider 从 OpenAI 切到 MiniMax `embo-01`（中文场景质量更好）时连踩五个坑：API 不是 OpenAI 兼容、维度官方文档与实际返回不一致、db/query 双空间、限流码 1002 不是标准 HTTP 429、批量大小 32 上限、单条 token 限制。逐条理顺后才能跑通 RAG 检索。

## Symptoms

- 按 OpenAI 兼容客户端调用 `/v1/embeddings` → 请求路径返回 200 但 body 字段名不对，`response.data` 是 `None`
- pgvector 列建成 `vector(1024)` 后写入触发 `dimension mismatch`，因为 embo-01 实际返回 1536 维
- `match_embeddings(query_embedding vector(1024))` 写死的维度让查询同样炸维度
- RAG 召回明显低于 OpenAI baseline —— 调试发现写入和查询用了同一类型，没有区分 `type: "db"` / `type: "query"`
- 全量同步 100 条 items 时 30 条左右开始一片 `status_code: 1002` —— HTTP 200 但业务码限流；没有自动重试时整个 sync job 直接失败
- 长 review/description（>1500 字符）单条调用直接 token 上限报错

## What Didn't Work

- **直接复用 `OpenAIEmbeddingProvider` 改 `base_url`**：失败。MiniMax embedding 不是 OpenAI 兼容协议——请求字段是 `texts`（不是 `input`），响应字段是 `vectors`（不是 `data`），还要 `GroupId` query 参数。Chat 走 `OpenAIChatProvider` 子类化 OK，embedding 必须独立类。
- **按官方页面"1024 维"建表**：失败。embo-01 实测返回 1536 维。最终以**实际响应维度**为准重写 migration，而不是 spec 文档。
- **不区分 db/query 类型**：失败。检索召回率掉一半。MiniMax 把存储向量和查询向量放在不同空间，存储时 `type: "db"`，查询时 `type: "query"`，retrieval 时也必须用 query 向量过 `match_embeddings`。
- **遇 1002 直接抛错**：失败。个人 tier RPM 紧，bulk sync 必然踩限流，需要指数退避自动重试。

## Solution

**1. 独立 provider，按 MiniMax 实际协议调用**（`backend/app/llm/embedding.py`）

```python
class MiniMaxEmbeddingProvider:
    _ENDPOINT = "https://api.minimaxi.com/v1/embeddings"
    _RATE_LIMIT_STATUS = 1002
    _MAX_RETRIES = 4
    _INITIAL_BACKOFF = 1.0

    def __init__(self, api_key, group_id, model="embo-01", dimensions=1536):
        if not group_id:
            raise ValueError("MiniMax embedding requires MINIMAX_GROUP_ID")
        ...

    async def embed(self, texts, *, query=False):
        payload = {
            "model": self._model,
            "texts": texts,                          # 注意是 texts 不是 input
            "type": "query" if query else "db",      # 双向量空间
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(self._MAX_RETRIES):
                response = await client.post(
                    self._ENDPOINT,
                    params={"GroupId": self._group_id},  # 必传
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
                response.raise_for_status()
                body = response.json()
                status_code = body.get("base_resp", {}).get("status_code", -1)
                if status_code == self._RATE_LIMIT_STATUS and attempt < self._MAX_RETRIES - 1:
                    await asyncio.sleep(backoff); backoff *= 2; continue
                if status_code != 0:
                    raise RuntimeError(f"MiniMax embedding API error: ... ({status_code})")
                return body["vectors"]
```

**2. 维度按实测值定**（`supabase/migrations/003_add_review_and_embeddings.sql` + `004_match_embeddings_function.sql`）

```sql
ALTER TABLE item_embeddings ADD COLUMN embedding vector(1536);  -- ← embo-01 实测维度
CREATE FUNCTION match_embeddings(query_embedding vector(1536), ...)
```

**3. Protocol 串透 `query` 关键字**（`backend/app/llm/protocols.py` 通过 retrieve 调用链）：写入路径默认 `query=False`（即 `type=db`），RAG 检索路径显式传 `query=True`。两类向量永远不混用。

**4. 批量 + 截断**（`backend/app/services/embedding.py`）

```python
_MAX_FIELD_CHARS = 600        # 每个 description/review 字段截断到 600 字符
                              # embo-01 单输入 ~500 token，中文 1.5 字符≈1 token，留余量
_EMBED_BATCH_SIZE = 32        # MiniMax 单次最多 32 条 texts

# 拼接条目文本时主动截 description 和 review
parts.append(_truncate(item["description"]))
parts.append(_truncate(item["review"]))

# 批量同步
for start in range(0, len(pending), _EMBED_BATCH_SIZE):
    batch = pending[start : start + _EMBED_BATCH_SIZE]
    vectors = await provider.embed([text for _, text, _ in batch])
    ...
```

## Why This Works

- **维度以响应为准**：vendor 文档常落后或写错；`vector(N)` 列一旦写错，下游 SQL 函数和写入路径都要改，所以接入新 embedding model 第一步就是手动 curl 一次看实际返回的 `vectors[0].length`。
- **db/query 双空间**：不是 MiniMax 独家行为（Cohere 的 `input_type` 也类似），但 OpenAI 没有这个区分让人容易忘。Protocol 接口把 `query` 作为 keyword-only 参数串到底，写入和查询路径就不可能混用。
- **1002 不是 HTTP 429**：MiniMax 用 `base_resp.status_code` 在 200 响应体里表达业务错误。指数退避要看这个字段，看 HTTP 状态码会漏掉所有限流。
- **600 字 + 32 batch**：让 bulk sync 在 personal tier 也能跑完。32 是硬上限，600 字是经验值（中文一字接近一 token，留余量给前缀拼接）。

## Prevention

1. **接入新 embedding provider 三连验证**：(a) `curl` 看响应字段名（不要相信 SDK 文档）；(b) 看 `vectors[0]` 实际长度（不要相信文档维度）；(c) 看是否有 db/query / input_type 双空间。这三条至少节约半天。
2. **Provider abstraction 必须是 Protocol，不是 OpenAIEmbeddingProvider 的子类**。Chat API 大多 OpenAI 兼容可以子类化，embedding API 各家差别极大（请求字段、响应字段、分空间、限流编码），统一走 Protocol：
   ```python
   class EmbeddingProtocol(Protocol):
       dimensions: int
       async def embed(self, texts: list[str], *, query: bool = False) -> list[list[float]]: ...
   ```
3. **Migration 维度参数化**：避免维度硬编码到 SQL 函数签名。如果后期换 model（512 / 768 / 1024 / 1536）每次都要改 migration，可以用环境变量在启动时注入或在 SQL 里用单值常量表 + dynamic SQL。
4. **限流处理是 must，不是 nice-to-have**：personal tier 几乎必踩。模板：业务码限流 → 退避重试（4 次，1→2→4→8s） → 失败抛错让上层决定是 fail-fast 还是降级。
5. **批量同步必带 progress + resume**：sync job 失败时不应整个回滚，按 batch 提交 hash → 下次跑时 `WHERE hash != stored_hash` 续做。本项目 `embedding.py` 的 content-hash dedup 就是这个目的。
6. **截断标志要打**：截断后的内容应该在 metadata 里记 `was_truncated: true`，方便后期回看哪些条目被裁过。当前实现没记，是个 P3 followup。

## Related Issues

- 修复 commits：
  - `1765952 fix(backend): switch to JWKS auth, MiniMax embeddings, and auto-sync on login`（首次切 MiniMax，错误地用 1024d）
  - `2fb2fa4 fix(embedding): align MiniMax pipeline to 1536 dims + 1002 rate-limit retry`（修维度 + 加退避 + 双空间）
- Plan: `docs/plans/2026-03-30-001-feat-ai-backend-upgrade-plan.md`（AI backend 升级）
- 文档: [MiniMax embedding API](https://www.minimaxi.com/document/algorithm-concept/embedding)
- 关联学习：本仓库 `docs/solutions/security-issues/idor-cross-tenant-conversation-access-2026-05-07.md`（同分支后续发现的 IDOR）
