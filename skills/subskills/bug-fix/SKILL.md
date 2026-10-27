---
name: bug-fix
description: "Use only when QA hands a registered, reproducible Bug to dev for correction and expects implementation evidence back. Do not invoke directly for user-reported or dev-discovered defects before QA registration."
metadata:
  version: 1.2.5
---

# bug-fix

仅在 `qa` 将已登记、可复现的 Bug 反馈给 `dev` 后，定位根因、实施最小修复并把开发证据交回审查与测试链路。`qa` 独占 Bug 的登记、定级、关闭与重开；`cr` 独占审查结论；`survey-corps` 处理跨角色的高风险裁决。

## 适用边界

- 唯一入口是 `qa -> dev` 的 Bug 反馈，输入必须包含 Bug ID、`failure_reference_version`、`environment`、`input_boundary`、复现条件、预期/实际行为和证据；缺项时回交 `qa` 补齐，不自行登记 Bug。
- 用户直接报告或 `dev` 自行发现的未登记异常，不调用本 Skill；按常规 `dev` 流程调查修正，再经 `cr -> qa` 验证，由 `qa` 登记与管理 Bug。
- 修复目标是恢复已有契约或已确认需求的预期行为，而非借机扩展功能、重定义业务规则或清理无关代码。
- 无法稳定复现时，先收集日志、Trace、输入、环境差异和最小反例；证据仍不足时，输出假设、观测方案与未关闭风险，不将猜测写成修复结论。
- 涉及公共契约、权限/信任边界、持久化修复、数据回填、不可逆操作、跨服务一致性或重大架构调整时，先升级 `survey-corps` 确认方案协议。

## 诊断与修复

1. 固定失败基线：完整读取错误、告警和调用栈，记录 Bug/需求 ID、`failure_reference_version`、`environment`、`input_boundary`、复现步骤、预期/实际行为和影响范围。
2. 收缩故障面：检查最近代码、依赖、配置和环境变化；寻找同仓库可工作的相似路径并逐项比较差异。跨组件时在边界验证输入、输出、配置和状态；异常值从失败点反向追到首次产生的位置。
3. 写出一个可证伪假设及其依据，每次只改变一个变量做最小实验；失败后撤销实验影响，基于新增证据形成新假设，不叠加猜测性补丁。
4. 定义修复不变量，并在修改实现前建立能稳定失败的最小复现测试；没有适用测试框架时使用一次性复现脚本，并保存失败证据。
5. 选择针对根因的最小可回退变更；若依赖迁移、补偿、开关或降级，随修复交付触发条件、执行步骤和验证点。
6. 用同一复现证明失败转为通过，再运行相邻边界、构建、静态检查和风险相称的开发验证；复现通过但根因链不成立时不得结束诊断。

## 门禁与交接

- 修复证据必须分别绑定 `failure_reference_version` 的失败结果和 `fixed_reference_version` 的成功结果，并保持 `environment`、`input_boundary` 一致；仅“代码看起来正确”不构成证据。
- 连续三个修复假设或补丁未解决问题时停止继续试错，重新检查边界与架构假设，并升级 `survey-corps` 对齐后再扩大改动。
- 不得吞掉异常、放宽校验、删除权限控制、静默改写历史数据或以全局重试掩盖根因；必要的兼容或降级必须说明退出条件。
- 将 Bug ID、根因、改动文件、保持不变的行为、复现/回归结果、未验证范围及恢复输入交给 `cr` 复审并供 `qa` 复测；由 `qa` 决定 Bug 状态。
- 按 `survey-corps` 已选链路交接；修复后必须先交付修复重点、契约影响和开发验证给 `cr` 复审，再交给 `qa` 复测；不得绕过 `cr`，也不得自行声明审查、测试或验收通过。
