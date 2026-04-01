---
date: 2026-03-28
topic: themes-ui-customization
---

# Themes / UI 自定义 — 预设主题切换

## Problem Frame

Liker 当前只有一套固定的暖色调界面（奶油背景 + 深色 sidebar），用户无法根据个人喜好或使用环境调整外观。v2.0 聚焦"Delight & identity"，主题切换让用户的收藏工具更有个人归属感，同时支持深色模式也是基本的可用性需求（夜间使用、OLED 省电）。

## Requirements

### 预设主题

- R1. 提供 5 套预设主题，每套包含完整的配色方案（sidebar、主区背景、卡片、文字、强调色、渐变）：
  - **暖光**（Warm）— 当前默认配色，奶油暖色调
  - **深空**（Midnight）— 深色主题，深灰/暗紫背景，重点打磨，确保对比度和可读性
  - **淡雅**（Frost）— 灰蓝冷色调，清爽干净
  - **樱花**（Sakura）— 粉色系，柔和温暖
  - **森林**（Forest）— 绿色自然系，沉稳舒适
- R2. 每套主题需确保文字与背景的对比度满足 WCAG AA 标准（正文 4.5:1，大文字 3:1）

### 切换入口

- R3. Sidebar 底部设置区域新增主题切换快捷入口（图标按钮，如 🎨 或调色盘图标），点击弹出主题选择面板
- R4. 设置面板中也包含主题选择区域，展示所有主题的预览色块，当前主题高亮
- R5. 主题选择面板中展示每套主题的名称、预览色块（2-3 个代表色），点击即可切换

### 切换行为

- R6. 切换主题时，所有颜色变量平滑过渡（约 300ms），不生硬跳变
- R7. 默认跟随系统深色/浅色模式：系统为深色时自动使用"深空"，系统为浅色时使用"暖光"
- R8. 用户手动选择主题后，覆盖系统跟随行为，保持手动选择
- R9. 提供"跟随系统"选项，允许用户重新回到自动跟随模式

### 偏好持久化

- R10. 已登录用户：主题偏好保存到 Supabase（user preferences），跨设备同步
- R11. 未登录用户：主题偏好保存到 localStorage
- R12. 登录后如果 Supabase 有已保存的主题偏好，优先使用云端偏好

### 视觉一致性

- R13. 所有图表（Recharts）的配色需跟随当前主题调整（tooltip 背景、轴文字颜色等）
- R14. 状态颜色（want/in_progress/completed/dropped）在所有主题中保持可辨识，可微调但不完全改变语义色

## Success Criteria

- 用户打开主题选择面板后，能在 5 套主题间一键切换，切换时有平滑过渡效果
- 深色主题在纯黑环境下使用舒适，文字清晰可读，图表配色协调
- 关闭浏览器重新打开后，主题偏好保持不变
- 跟随系统模式的用户，切换 OS 深色/浅色时 Liker 自动跟随

## Scope Boundaries

- 不支持用户自定义颜色/创建自定义主题（仅预设切换）
- 不支持字体切换（字体保持 Cormorant Garamond + Outfit）
- 不支持每个分类独立主题
- 不包含主题商店/社区分享主题

## Key Decisions

- **预设主题而非自定义配色**：精心设计的预设主题比用户自调色盘效果更好，大部分用户只需选一个喜欢的预设。维护成本低，品牌一致性好
- **跟随系统为默认行为**：现代用户习惯 OS 级深色模式，Liker 应该尊重这个偏好而非强制暖色主题
- **偏好跟账号同步**：主题是个人身份的一部分，换设备应该保持一致

## Dependencies / Assumptions

- 依赖现有 CSS 变量系统（`:root` 中定义的所有颜色变量）
- Supabase 需要有存储用户偏好的能力（可能需要新建 preferences 表或在 users 表加字段）

## Outstanding Questions

### Deferred to Planning

- [Affects R10][Technical] Supabase 偏好存储方案：新建 user_preferences 表 vs 在现有表加 jsonb 列
- [Affects R6][Technical] CSS transition 的具体实现：给 :root 变量加 transition 还是用 class 切换 + transition
- [Affects R13][Technical] Recharts 图表配色如何跟随主题切换（Recharts 使用内联样式，不直接读 CSS 变量）

## Next Steps

-> `/ce:plan` for structured implementation planning
