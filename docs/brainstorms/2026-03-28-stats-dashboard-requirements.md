---
date: 2026-03-28
topic: stats-dashboard
---

# Stats Dashboard — 数据可视化统计面板

## Problem Frame

Liker v1.0 用户积累了大量收藏数据（条目、评分、状态变更、分类），但只能在 Overview 看到最基础的统计（总数、均分）。用户无法回顾自己的消费趋势、发现偏好模式、或获得"我今年看了多少部电影"这类有价值的洞察。一个 delightful 的统计面板能让数据本身成为产品的吸引力，增强用户持续记录的动力。

## Requirements

### Overview 增强

- R1. Overview 页在现有 stat pills 基础上，新增一个紧凑的"近期活动"可视化（如迷你热力图或 sparkline），展示最近 30 天的添加活跃度
- R2. Overview 各分类卡片增加一个"本月新增"计数，体现时间维度

### 独立统计页

- R3. Sidebar 新增"统计"入口（与分类列表平级），点击进入全屏统计视图
- R4. 统计页顶部展示 hero 指标卡片：总条目数、本月完成数、平均评分、最活跃分类
- R5. 支持时间范围筛选：近 30 天 / 本月 / 本年 / 全部，切换后所有图表联动更新
- R6. **活动时间线**：面积图/折线图展示条目添加趋势，按周或月聚合（根据所选时间范围自动切换粒度）
- R7. **分类分布**：环形图展示各分类的条目占比，使用各分类的 emoji 图标标识
- R8. **评分分布**：柱状图展示 1-5 星各有多少条目
- R9. **状态分布**：展示 want / in-progress / completed / dropped 各状态的条目数量
- R10. **个人记录卡片**：展示个性化亮点数据，如"最高评分条目"、"最活跃月份"、"完成最多的分类"等

### 视觉与体验

- R11. 所有图表使用项目现有的 coral-purple 渐变配色、Outfit 字体、圆角风格，视觉上与主应用完全融合
- R12. 图表使用 Recharts 实现，stat cards 和简单指标用纯 CSS 保持轻量
- R13. 图表需要有流畅的入场动画，呈现 delightful 的体验
- R14. 统计页需适配移动端（< 640px 时图表堆叠排列）

## Success Criteria

- 拥有 10+ 条目的用户打开统计页后，能立即看到有意义的趋势和分布数据
- 时间范围切换后，所有图表在 200ms 内更新（纯前端计算，无网络请求）
- 统计页的视觉风格与主应用完全一致，不像"嵌入了一个第三方 dashboard"

## Scope Boundaries

- 不包含 Year in Review（年度回顾是独立 feature，但本次建设的统计基础设施将为其复用）
- 不包含数据导出功能
- 不包含与其他用户的对比/社交统计
- 不新增数据采集 — 仅使用现有 Item 和 LogbookEntry 数据

## Key Decisions

- **Recharts + 纯 CSS 混合方案**：复杂图表（折线图、面积图、环形图、柱状图）用 Recharts，简单元素（stat cards、progress bars）用纯 CSS。兼顾开发效率和视觉一致性
- **纯前端计算**：统计数据从已加载的 items + logbook entries 在前端聚合计算，不新增后端接口。数据量在个人使用范围内（< 10K 条目），性能不是问题
- **Overview 轻量增强 + 独立详情页**：Overview 保持简洁，加一个 sparkline 和月度计数即可；详细统计放在独立页面，避免 Overview 过于拥挤

## Dependencies / Assumptions

- 依赖现有 Item 数据（createdAt、rating、categoryId、status）和 LogbookEntry 数据（状态变更时间戳）
- 假设 genre 字段的填充率有限（不是所有条目都有 genre），genre 相关统计为可选展示

## Outstanding Questions

### Deferred to Planning

- [Affects R6][Technical] 活动时间线的聚合粒度策略：30 天用日聚合、本年用月聚合，具体切换逻辑在实现时确定
- [Affects R10][Technical] 个人记录卡片的具体内容项：基于实际数据分布，在实现时决定哪些"亮点"最有意义
- [Affects R1][Technical] Overview sparkline 的具体形式（热力图 vs 折线 vs 柱状）在实现时根据空间和视觉效果决定

## Next Steps

-> `/ce:plan` for structured implementation planning
