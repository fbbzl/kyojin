# SC Agent Tree MCP App

这是项目内、零依赖的 Node stdio MCP server。它不是常驻服务：宿主在需要时启动 `server.js`，SC 状态更新通过 `show_sc_task_view` 传入当前 snapshot；Codex `thread` entrypoint 则以空参数调用同一工具。工具以 `_meta.ui.resourceUri` 绑定静态 `text/html;profile=mcp-app` resource，并以 `openai/ui` 的 `thread` entrypoint 声明 Codex 任务内入口。工具返回 `structuredContent.snapshot`，UI 通过 MCP Apps 的 `ui/notifications/tool-result` bridge 渲染该快照。

这是 SC 任务视图的唯一渲染路径。项目不生成或打开本地 `visualizations` HTML，也不提供文本或其他替代视图。若 MCP tool 不可用或调用失败，SC 工作单元将进入 `blocked`，直到插件和 MCP Apps 能力恢复。

角色严格串行，同时最多一个 `running`。QA 的所有工作均须等选中的 CR 为 `passed` 后启动；CR 缺失、未选择或其余四种状态均不能启动 QA。服务端在缓存和计时前拒绝非法快照；直接渲染旧非法快照时不高亮、自动展开或播放交接动效，计时器也不启动活动时段，角色原始状态保持不变。`roles` 的数组和单角色标量按同一规则规范化校验。

任务和角色耗时由服务端在当前会话内自动统计：所选角色自身状态为 `running` 时累计，不根据任务总状态推断角色运行；等待用户、暂停、全局 blocked 或结束时停止，任务总值按活动时段并集计算，不叠加并行角色。状态变化或空参数恢复视图时结算，页面不轮询；任务耗时仅在任务结束后展示，角色耗时仅在 `passed` 后展示，角色其余四种状态均隐藏角色耗时；任务进行中、暂停、等待和阻断时隐藏任务耗时。未上报的任务暂停/结束无法自动识别。包含 object `work_unit` 的快照才创建或启动计时；纯 `{view_id,state}` 快照保持原样，但显式暂停或结束仍停止同一 view 的已有计时。首次可以提供有效的 `metrics.elapsed_ms` 作为历史基线，后续回传不会重复累计。计时记录按 `view_id` 隔离，内存最多保存 128 个任务，满后明确拒绝新 ID；服务重启不会保留历史时段。Token 用量不再采集或展示，旧 `total_tokens` 仅兼容透传。

## Git 信息与角色表情

编排者可在 `work_unit.git` 提供 `repository`（仓库短名）和 `branch`。视图在最左上角、项目 MCP 上方仅显示这两个有效字符串，以“ · ”连接，不加 Git 前缀；旧 `commit`、`dirty` 字段兼容保留但不展示。它与靠右的总状态共用同一顶栏，宽窄屏均保持左右布局。缺失、空白或类型无效的名称隐藏，均无效或仅有旧字段时隐藏该内容，状态仍靠右；长文本在左列自然换行，不覆盖状态。项目 MCP 和调试按钮位于后续工具行，均无内容时不占空行。编排者仅在任务开始或角色交接等明确刷新时采集，不提供本机路径、远端 URL 或秘密信息；UI 和 server 不读取 Git、不轮询。

角色精确为 `running` 时，角色名旁显示 🔥，仅在该角色为合法活动角色时播放 1.8 秒柔和明暗呼吸；任务停止、非法活动快照和减少动态偏好下静止。表情标记为装饰，不改变状态文字或交互，也不采集或推测 token 用量。

角色状态精确为 `pending` 或 `needs_user_confirm` 时改用 ⌛，在 1.8 秒周期的前 70% 静止，随后翻转；该等待动效不依赖角色运行高亮，任务进行中的非活动待开始角色也可播放，仅提示等待、不表示执行或改变门禁。总状态为 `needs_user_confirm` 时仍播放，`paused`、`waiting`、`blocked`、取消或结束及减少动态偏好下静止；这一停止规则仅指沙漏，不限制下述阻断角色提示。右上总状态字号为 22px，保留同一顶栏的右对齐布局。

角色精确为 `passed` 时改用 🎉。同一有效任务 ID 下，所选角色从其他有效状态变为通过时，以 650ms 缩放、轻微旋转和固定 CSS 彩带喷出庆祝一次，彩带随后消失、图案静止；首次加载历史通过、同状态刷新、任务切换和角色重新加入不补播，返修后再次通过可重播。减少动态偏好下静止；刷新清理前次动画和监听，不增加快照字段、计时器、canvas、动态粒子系统或依赖。彩带仅用角色名内的两个装饰伪元素，不占布局；其结束事件不提前清理父动画。

角色精确为 `blocked` 时默认显示 👻，以 1.8 秒周期小幅上下漂浮；仅 CR/QA 的 `role_details.<role>.blocker_type` 精确为 `bug` 时显示 🐞，沿同一周期小幅左右爬动、间歇停顿。原因缺省、未知或其他类型均回退普通阻断，不扫描摘要文字。它仅是可选、向后兼容的装饰元数据，不改变状态、门禁或服务端行为；总状态 `blocked`、`cr_blocked`、`qa_failed` 下仍提示，真正暂停、取消、结束及减少动态偏好下静止。

左侧全部参与角色卡由一个 2px 圆角虚线框包围，右侧任务详情不在框内。框随角色链自然高度变化；任务未结束且存在唯一合法活动角色时，虚线段沿固定外框路径匀速流动，否则静止，减少动态偏好下同样静止。未选择角色时隐藏框；装饰层不接收指针或焦点，不改变卡片、流转箭头和详情归属线的布局，也不新增依赖、轮询或 JavaScript 帧循环。

上下文的“参与角色”沿用 `work_unit.roles` 的有效去重原序，以紧凑 2px 圆角标签和向右箭头展示。22px 长、2px 粗的水平箭杆及箭尖贴住两侧标签边框，亮条与箭杆对齐。窄屏将角色链放在字段名下一整行，跨满元数据两列，保留标签字号、内距和箭头长度，其他字段位置不变。任务未结束且有唯一合法活动角色时，箭头复用现有 1.8 秒流光，从左至右经过；停止、非法活动或减少动态偏好下静止。它仅标识所选链的排列方向，不代表真实角色交接，也不新增快照字段或动画管理器。

## 交接动效

视图保留活动角色的呼吸高亮，并为真实交接增加单次 650ms 连线流光、随后 420ms 接收卡片提亮。编排者为每次新建的 `handoffs` 记录填写当前任务的 `work_unit_id`，并生成同任务内唯一、稳定的 `handoff_id`；`from`、`to` 使用小写角色名，同一次 `pending -> accepted` 保留 ID，新的返工交接使用新 ID。此字段是兼容扩展，已有快照无需迁移，没有 ID 时只展示静态交接状态。

同一根元素持续展示同一 `view_id` 时，只检测末尾新加一条 `accepted` 或末尾同条 `pending -> accepted`；其余历史身份和接收结果须不变。角色状态仅接受 `pending`、`running`、`passed`、`blocked`、`needs_user_confirm` 五个精确值；缺省仅显示缺信息，不推断运行。子技能状态保持独立契约。同一快照必须提供唯一活动接收角色显式 `status=running`，交接双方须为当前选中链的相邻角色；若交接包含 `work_unit_id`，必须匹配当前任务。正向向下、逆向返工向上，箭头和流光方向一致；跨多角色、批量历史更新保持静态。

首次加载、第二根元素初次展示、切换任务后返回、相同快照刷新、历史替换不重播。已接受 ID 去重；暂停、等待、阻断、结束、接收角色未运行、减少动态偏好下首次出现的已接受记录也会消耗 ID，恢复后不补播。手动展开、键盘焦点、所选角色和静态状态不受动效影响。每次快照清理上一段瞬时动画，减少动态偏好禁用全部动画和过渡；不新增依赖、定时器、后台轮询或持久化记录。

角色和子技能详情保留原生 `details` 交互，仅在折叠项新打开时，对直属内容播放 180ms 渐显和轻微位移；关闭即时收起。首次快照、刷新后保留的展开项不重播，减少动态偏好下直接展示内容；过渡不改变角色互斥、焦点、运行呼吸或交接动效。

## 本地验证

```powershell
node .\skills\survey-corps\mcp-app\test-server.js
node .\skills\survey-corps\mcp-app\test-elapsed-tracker.js
node .\skills\survey-corps\mcp-app\test-elapsed-integration.js
node .\skills\survey-corps\mcp-app\test-cr-contract.js
node .\skills\survey-corps\mcp-app\test-app-bridge-contract.js
node .\skills\survey-corps\mcp-app\test-thread-entrypoint-contract.js
node .\skills\survey-corps\mcp-app\test-plugin-structure.js
node .\skills\survey-corps\mcp-app\test-motion-contract.js
node .\skills\survey-corps\mcp-app\test-handoff-motion.js
node .\skills\survey-corps\mcp-app\test-handoff-motion-behavior.js
node .\skills\survey-corps\mcp-app\test-ui-contract.js
node .\skills\survey-corps\mcp-app\test-ui-behavior.js
node .\skills\survey-corps\mcp-app\test-protocol-boundaries.js
node .\skills\survey-corps\mcp-app\test-failure-detection.js
node .\tools\test-codex-lifecycle.js
```

仓库提供一行引导命令：`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/fbbzl/kyojin/main/tools/codex-bootstrap.ps1))) -Action Install`。它会自动克隆或更新本地仓库，再调用 `tools/codex-sctask-view.ps1` 完成生命周期操作。`Install` 注册并验证插件，`Update` 验证当前代码并提示重载，`Uninstall -Confirm` 移除本仓库 marketplace 注册。本地脚本卸载不调用 Git，也不要求 Node 或插件源码完整；若需离线卸载，直接运行本地脚本。两个入口均支持 `-WhatIf` 和 `-Confirm`；引导脚本统一确认一次，拒绝或预演不更新仓库、不写入注册。注册前验证失败不会留下新注册，同名来源冲突会明确拒绝。脚本不删除插件源代码，也不能代替 Codex Desktop 的宿主重载操作。

## 注册（需用户自行授权）

本仓库不会改写 Codex 配置，也不会代为安装。安装前请确认 Codex Desktop 支持本地 marketplace plugin 与 MCP Apps；随后由用户自行从仓库根目录的 `.agents/plugins/marketplace.json` 的 `source: { "source": "local", "path": "./skills/survey-corps/mcp-app" }` 选择 `survey-corps-task-view`。该 path 相对 marketplace root（仓库根）解析。安装配置使用 `node`、plugin cwd 和相对 `server.js`，不依赖本机绝对路径。不要使用 `codex mcp add` 注册同名 server；若用户配置中已有同名旧项，应先由用户自行移除或改名，避免冲突。

marketplace 将该插件标为 `AVAILABLE`、`ON_INSTALL` 和 `Productivity`；这些字段控制客户端的发现与安装流程，不构成运行时隔离保证。

注册的具体配置键由客户端版本决定；状态更新时调用 `show_sc_task_view`，参数为 `{ "snapshot": <当前 SC 快照> }`。`snapshot.view_id` 必填，对同一工作单元固定为 `sc-task-view:<work_unit_id>`；它是逻辑标识，不是路径或资源 URI，也不在 UI 中展示。入口空参调用 `{}` 会恢复当前 server 会话最近一次收到的快照；在首次收到快照前才返回 `sc-task-view:empty` 空视图。MCP App 资源 URI 为 `ui://survey-corps/task-view`。标准 `ui.resourceUri` 负责关联 HTML resource；Codex 专用的 `openai/ui.thread` entrypoint 负责让宿主把该 App 暴露为当前任务的侧栏入口。该入口仅声明可供用户在任务内容 tab 手动打开，不保证更新工具调用后自动展开右侧面板。

角色顺序由编排者写入 `work_unit.roles`，视图保留该原序；脚本缓存与短确认输出示例见 [SC 快照更新与输出](../SKILL.md#快照更新与输出)。

## 安全与边界

- 请求帧上限为 256 KiB，输入及加入耗时后的快照上限为 200 KiB（均按 UTF-8 字节计算，快照预算为响应封装预留空间）。超限会拒绝且不改变缓存和计时记录。快照仅接受 JSON object，`view_id` 必须是非空字符串；可选的 `state` 必须是字符串。所有快照值由原模板以 `textContent` 输出。
- 角色卡只展示 `work_unit.roles` 中的有效参与角色；未选择角色时不生成角色卡。角色名称标记不在视图中展示。
- server 本身不联网、不写入磁盘，快照仅在当前 server 进程内缓存最近一份，另保存最多 128 个任务的计时记录，无轮询或后台服务；marketplace 元数据不是运行时隔离保证。
- 工具展示不改变 SC 权威状态、交接或完成门禁。
- 已在当前验证环境完成 MCP App 注册与工具调用验收；`show_sc_task_view` 状态更新调用成功并返回 `structuredContent.snapshot`。不同 Codex Desktop 版本仍需单独确认宿主面板的视觉渲染。
