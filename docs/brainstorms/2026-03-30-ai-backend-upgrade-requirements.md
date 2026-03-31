---
date: 2026-03-30
topic: ai-backend-upgrade
---

# Liker AI 后端升级：从纯前端到 AI 产品

## Problem Frame

Liker 目前是纯前端应用（React + localStorage/Supabase），没有独立后端，也没有 AI 功能。用户（开发者本人）正在求职"AI 产品公司后端工程师"方向，需要一个能在简历和面试中展示 **后端系统工程 + LLM 集成能力** 的项目。

当前简历的空白：
- 没有后端 API 设计的个人项目（华为经历是云服务，不是产品后端）
- 没有任何 LLM/AI 集成经验
- 没有 RAG 相关实践

## Requirements

### 后端基础架构

- R1. 使用 Python + FastAPI 搭建独立后端服务，提供 RESTful API
- R2. 后端对接现有 Supabase 数据库，作为数据访问层（不替换 Supabase，而是后端通过 Supabase SDK 读写数据）
- R3. 设计 LLM Provider 抽象层，支持在 Claude / OpenAI / DeepSeek / Kimi / MiniMax 之间切换，通过配置选择当前 provider

### 数据模型增强

- R13. Item 新增 `review` 文本字段，用于存储用户的文字评价（如"剧情反转很精彩，结尾让人意犹未尽"）
- R14. 前端编辑界面增加评价输入区域（textarea），评分和评价并存
- R15. 文字评价作为 embedding 的核心输入之一，与标题、描述、分类一起构建语义向量，提升 RAG 检索和推荐的语义质量

### AI 功能一：智能推荐 + 自然语言搜索

- R4. 自然语言搜索：用户输入自然语言查询（如"帮我找一部像星际穿越的硬科幻电影"），后端调用 LLM 理解意图，结合用户收藏数据和外部 API 返回匹配结果
- R5. 智能推荐：基于用户收藏历史、评分和文字评价中的情感偏好，LLM 生成个性化推荐理由和推荐列表，而非当前的随机推荐
- R6. 使用 LLM function calling 来编排搜索流程（解析意图 → 查询收藏 → 调用外部 API → 整合结果）

### AI 功能二：RAG 口味分析

- R7. 将用户收藏数据（标题、描述、评分、用户评价、分类、标签）embedding 化，存入向量数据库。用户评价是 embedding 的高权重输入，因为它包含最丰富的主观语义信息
- R8. 提供对话式口味分析：用户可以问"我最喜欢什么类型的电影""我的阅读偏好是什么""根据我的口味推荐一本书"，后端通过 RAG 检索相关收藏 + LLM 生成分析
- R9. 收藏数据变更时（增/删/改），自动更新对应的 embedding

### 前端集成

- R10. 前端新增 AI 对话入口（侧边栏或浮动按钮），支持自然语言输入
- R11. AI 响应支持流式输出（SSE），前端逐字展示
- R12. 推荐结果可一键添加到收藏

## Success Criteria

- SC1. 面试官看到项目后能清晰理解：这是一个有独立后端 + LLM 集成 + RAG 的全栈 AI 产品
- SC2. 能在面试中深入讨论：LLM Provider 抽象设计、RAG Pipeline 架构、function calling 编排逻辑、流式响应实现
- SC3. 项目实际可用：自然语言搜索和口味分析能给出合理结果
- SC4. GitHub README 清晰展示架构图和技术决策

## Scope Boundaries

- 不做用户认证系统重构（继续使用 Supabase Auth）
- 不做模型微调或训练
- 不做复杂的评估体系（但可以在 README 里描述未来方向）
- 不做前端大重构，AI 功能以新增组件方式接入
- 不做部署/运维自动化（本地开发环境即可）
- 不追求推荐质量的完美，重点是展示工程架构能力

## Key Decisions

- **后端语言：Python + FastAPI** — 与 AI 生态对齐，面试目标岗位的主力语言
- **LLM 多 Provider 支持（Claude / OpenAI / DeepSeek / Kimi / MiniMax）** — 展示接口抽象和架构设计能力，覆盖国内外主流 provider，面试时可以聊设计决策和各 provider 差异
- **Item 新增 review 文字评价字段** — 纯评分是结构化数据，文字评价是非结构化数据，两者结合让 embedding 语义更丰富，也让面试时可以聊"结构化 + 非结构化数据的融合"
- **RAG 而非纯 LLM** — RAG 比直接调 API 多了 embedding + 向量检索 + context 组装，展示更多工程深度
- **流式响应（SSE）** — 展示异步编程能力和前后端实时通信经验
- **保留 Supabase 作为主数据库** — 不造轮子，后端作为 AI 服务层叠加在现有架构上

## Dependencies / Assumptions

- 需要至少一个 LLM API key（Anthropic / OpenAI / DeepSeek / Kimi / MiniMax）
- 需要一个 embedding 模型（可用 OpenAI text-embedding-3-small 或开源替代）
- 向量数据库选型延迟到 planning 阶段决定（ChromaDB / Qdrant / pgvector）
- Supabase 数据库 schema 需新增 review 字段（非破坏性变更，ALTER TABLE ADD COLUMN）

## Outstanding Questions

### Deferred to Planning

- [Affects R7][Technical] 向量数据库选型：ChromaDB（嵌入式，最简单）vs pgvector（复用 Supabase PostgreSQL）vs Qdrant（更专业但多一个服务）
- [Affects R6][Needs research] function calling 的具体编排流程设计：单轮 vs 多轮 agent loop
- [Affects R3][Technical] LLM Provider 抽象层的接口设计：是否使用 litellm 之类的现有库，还是自己写薄抽象
- [Affects R9][Technical] embedding 增量更新策略：实时更新 vs 批量定时更新

## Next Steps

→ `/ce:plan` for structured implementation planning
