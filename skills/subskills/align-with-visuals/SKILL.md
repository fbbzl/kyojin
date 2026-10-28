---
name: align-with-visuals
description: "Use when req needs a visual artifact to clarify requirements more efficiently than text alone."
metadata:
  version: 1.4.3
---

# align-with-visuals

`align-with-visuals` 是 `req` 的可视化对齐子技能。它把当前需求分歧变成可查看、比较或反馈的最小视觉产物；它不维护需求状态，也不把结论直接交给 `dev`。

## 启用与边界

- 仅由 `req` 调用：视觉表达能实质降低当前理解偏差时调用；用户明确要求图、原型、页面结构、流程展示、权限矩阵、接口示例或方案比较时必须调用，即使文字已经足够。
- 高风险规则本身不清晰时先由 `req` 澄清来源和裁决，视觉展示不能把未确认内容变成事实。
- 本技能不替代需求状态、技术方案、实现、测试或发布结论。

## 图示表达

静态关系图优先 Mermaid；当前客户端无法渲染时提供等价的 ASCII 字符图。只有需要交互探索或用户明确要求时才产出 HTML；图示仅用于澄清当前材料中的结构、流程或选项，不新增需求、不替代用户确认。

## 工作方式

1. 读取当前需求版本、来源、范围、假设、开放问题和需要对齐的具体分歧；来源不足时返回 `req`。
2. 选择能消除该分歧的最小视觉形式，通常只生成一个主体视图；额外视图必须解决不同问题。
3. 选择与分歧匹配的最小格式：静态关系图用 Mermaid 或 ASCII；需要交互探索时产出 UTF-8、可独立查看的单文件 HTML；用户指定其他格式时服从用户要求。
4. 在产物中区分已确认事实、假设、开放问题和未覆盖范围，并关联来源、版本和适用范围。
5. 将产物、已验证/未验证范围和用户反馈返回 `req`；反馈不自动改变需求状态或触发外部操作。

每个产物必须有在同一工作单元内稳定的 `artifact_id`、仅在内容变化时递增的 `artifact_version`、实际产出格式 `artifact_format`（`mermaid`、`ascii`、`html`、`svg`、`png` 或用户明确指定的格式名）和本轮观察时间 `observed_at`。`artifact` 只能引用实际生成的本地路径、内联 Mermaid/ASCII 内容或已存在的用户指定资源；不得猜测 URL、补造产物或把未验证的渲染结果写成已验证。用户反馈若存在，必须带稳定 `feedback_id`、观察时间和对需求结论的影响；没有反馈时返回空数组。

## 质量与授权边界

- 只展示当前分歧所需内容，不保留装饰、占位模块或无来源数据。
- 多个视图共享的规则、状态和数据必须一致；差异视图只在存在上一有效版本且变化影响结论时生成。
- HTML 交付前实际打开，检查窄屏与桌面布局、文字遮挡、控制台错误和关键交互结果；Mermaid 检查渲染或提供等价 ASCII。工具不可用时明确未验证范围，不宣称可用性已验证。
- 选择控件只用于尚未决定且会影响范围、验收或风险的事项，已明确内容不重复确认。
- 产物默认本地运行，不发起未授权网络请求，不持久化反馈，不提交或写入外部系统。

## 返回给 req 的结果

```yaml
visual_alignment:
  work_unit_id:
  requirement_version:
  artifact_id:
  artifact_version:
  artifact_format:
  artifact:
  observed_at:
  purpose:
  source_evidence: []
  verified_scope: []
  unverified_scope: []
  assumptions: []
  decision_items: []
  feedback_ids: []
  user_feedback: [] # each item: feedback_id, observed_at, decision_impact
  next_action:
```

`confirmed`、验收、风险接受和需求版本更新均由 `req` 根据当前基线判定。
