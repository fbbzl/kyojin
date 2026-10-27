---
name: bug-cause
description: "Use when dev needs an evidence-based root-cause analysis for a QA-registered, reproducible Bug before or alongside implementation repair. Do not use to register, close, or retest Bugs."
metadata:
  version: 1.0.2
---

# bug-cause

仅在 `qa` 已登记并确认可复现的 Bug 后，由 `dev` 进行证据化根因分析。目标是说明故障如何产生、首次偏离预期的位置、影响边界和可验证的修复方向；它可以作为 `bug-fix` 的诊断阶段，但不替代修复、测试或 Bug 生命周期管理。

## 适用边界

- 输入至少包含 Bug ID、代码版本、环境、复现步骤、预期/实际行为、影响范围和现有证据；缺项时回交 `qa` 补齐，不自行登记 Bug。
- 用户直接报告或 `dev` 自行发现的未登记异常，不调用本 Skill；按常规 `dev` 流程调查修正，再经 `cr -> qa` 验证，由 `qa` 登记与管理 Bug。
- 根因分析只恢复已有契约或已确认需求的预期行为，不借机扩展功能、重定义规则或清理无关代码。
- 涉及公共契约、权限/信任边界、持久化与数据一致性、跨服务协议、性能目标或不可逆操作时，补充 `cr` 审查或升级 `survey-corps` 进行方案裁决。

## 分析流程

1. 固定基线：记录 Bug、需求或契约 ID，提交版本、环境、输入数据、复现步骤和预期/实际行为。
2. 还原因果链：从失败现象沿调用、状态、数据和配置边界反向追踪，定位首次偏离预期的位置；区分直接原因、促成条件和触发条件。
3. 建立可证伪假设：每个假设写明证据、反证条件和最小验证动作；一次只改变一个变量，不用连续猜测叠加补丁。
4. 验证根因：使用日志、Trace、断点、最小复现或回归测试验证因果链。无法稳定复现或证据不足时，输出未确认假设和下一步观测，不得宣称根因已确定。
5. 定义修复输入：给出根因对应的最小修复方向、保持不变的行为、回归测试重点、受影响范围和恢复/降级要求，再交给 `bug-fix` 或常规 `dev` 流程实施。

## 输出要求

```yaml
bug_cause_analysis:
  bug_id:
  reference_version:
  environment:
  observed_behavior:
  expected_behavior:
  reproduction_evidence: []
  causal_chain: []
  confirmed_root_cause:
  contributing_conditions: []
  ruled_out_hypotheses: []
  affected_scope: []
  unverified_scope: []
  repair_direction:
  regression_focus: []
  recovery_or_mitigation:
  evidence: []
  next_action:
```

- `confirmed_root_cause` 只写已由证据验证的原因；推测内容放在未确认假设或未验证范围。
- 证据必须绑定同一版本、环境和输入边界；旧版本或其他环境的观察只能作为历史参考。
- 分析结果交给 `bug-fix`/`dev` 实施，必要时交给 `cr` 审查；`qa` 负责复测原复现及受影响范围，并独占决定关闭或重开 Bug。

## 停止条件

- 连续三个假设或验证动作未缩小故障面时，停止继续试错，重新检查边界、基线和架构假设。
- 发现可能的 P0/P1、数据损坏、安全越权或未授权变更时，立即保留证据、冻结相关动作并升级 `survey-corps`；不以猜测性修复替代事件处理。
