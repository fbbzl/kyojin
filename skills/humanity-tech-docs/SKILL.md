---
name: humanity-tech-docs
description: "先以准确性为先审查，再进行受控的语言清理，完善现有技术文档。适用于 API 参考、README、设计说明和技术指南。"
metadata:
  version: 1.0.4
---

# 技术文档精修

使用本技能分两个有序阶段修订现有技术文档。本技能是下列两个本地 skill 的工作流封装，不替代它们。

## 必需依赖

使用当前 skill 清单将两个依赖解析为绝对路径；必须先读取并遵循 [依赖目录解析规则](references/dependency-locations.md) 中的原有环境变量与默认目录规则，再判断依赖是否缺失。按顺序读取它们，记录路径及版本或内容摘要，并确认它们支持下述技术文风和契约保护要求。依赖不兼容时停止并报告；依赖发生变化时重新检查：

1. `technical-writer-voice/SKILL.md`
2. `humanizer/SKILL.md`

如果任一依赖不可用：

1. 在编辑文档前停止，并报告确切缺失的 skill 名称。
2. 询问用户是否安装缺失依赖。`y` 表示同意，其他回答均表示拒绝。
3. 用户同意后，读取并使用本地 `.system/skill-installer/SKILL.md`。仅从以下固定公共路径安装缺失的 skill：
   - `adrielkuek/Write-Like-A-Human`, `skills/technical-writer-voice`
   - `adrielkuek/Write-Like-A-Human`, `skills/humanizer`
4. 确认已安装的 `SKILL.md` 文件存在，然后从加载依赖阶段继续本工作流。

不得静默替换为通用写作流程。没有用户明确同意，不得安装任何内容。安装失败时报告失败原因，不编辑文档。

## 工作流

1. 先应用 `technical-writer-voice`。检查文档结构、术语、请求和响应契约、参数组合、约束、错误、分页，以及已记录事实和未知响应结构之间的边界。
2. 再应用 `humanizer`，使用 `technical` 或 `technical-writer` 文风及 `technical` 目的。此阶段仅进行简洁、准确的表层清理。

除非用户明确要求修改，否则保留代码标识符、命令、配置键、度量值、链接、约束、示例和已记录行为。对于 API 参考，还要保留接口 URL、HTTP 方法、请求头名称、字段名、类型、必填性、默认值、业务码、认证规则、错误条件和 JSON 示例。不得编造未记录的字段、值、错误、性能声明、环境细节或技术结论。

编辑前，将事实性变更追溯到当前代码、项目规范、已验证测试或用户提供的权威材料。记录来源位置；发现冲突或不受支持的声明时报告，不自行编造解决方案。清理完成后，依据这些来源和原始 diff，重新核对变更事实，以及保留的标识符、值、示例和限定条件；同时检查代码围栏是否成对，并解析 JSON 示例。报告未解决事实和验证限制。

若依赖缺失、权威来源冲突、代码围栏不成对或 JSON 示例无法解析，先停止编辑并将其记录为阻断；不得用推测、旧版本结果或未验证的替代来源继续修改。

## 交付

交付时说明实际修改的文件、覆盖范围、事实性变更的来源、未解决事实和未验证范围。使用以下字段记录可复核证据；字段值必须来自本轮实际观察，不能用空泛的“已检查”替代结论：

```yaml
documentation_delivery:
  status: edited | unchanged | blocked
  observed_at:
  baseline:
  environment:
  files: []
  covered_scope: []
  factual_sources: []
  checks: []
  acceptance: []
  unresolved_facts: []
  unverified_scope: []
  next_action:
```

`blocked` 必须说明阻断原因和解除条件；`unchanged` 必须说明未修改原因和下一步；`edited` 必须列出实际文件、来源定位和已执行检查。
