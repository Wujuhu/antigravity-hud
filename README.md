# AGY HUD

> 为 **Antigravity** 打造的跨平台极简输入栏遥测插件：在聊天输入框「权限选择器」左侧注入紧凑胶囊，鼠标悬停展开上下文构成、生成速率、本轮/总缓存命中率、账号全分组 5h/周额度以及周额度总 Token 与费用估算；**支持完全自定义显示的数据项与顺序**，内置 **GitHub Releases 检查与自动更新**。
>
> **零外部 npm 依赖（Node.js >= 22.5.0）** · **不修改 `app.asar` 与 `config.json`** · **Windows（`.lnk` 快捷方式）& macOS（套壳 `.app`）双平台支持**

---

## 核心功能

* **输入栏紧凑胶囊（可自定义数据与顺序）**：挂载在权限选择器（如 `Turbo ▾`）左侧，默认展示 **上下文圆环占比 · 实时生成速率 (`tok/s`) · 当前模型 5h 额度**，可选开启 **本轮缓存命中率 / 会话累计 Token / 真实上游模型**，全部支持拖拽或按钮排序。
* **轻量悬停（Hover）详情浮层（可自定义区块与顺序）**：只聚焦当前对话核心指标，保持轻盈不挡屏：
  * **上下文总览与 5 类构成**：精确 Token / 会话窗口上限 + 系统底座 / 规则与技能 / 对话历史 / 工具输出 / 思考占比条。
  * **速率与 Prompt 缓存双列**：本轮速率、会话均值、本轮输出、**本轮缓存命中率**与**累计总缓存命中率**。
  * **全分组账号额度**：同时展示 **Gemini / GPT&Claude / Argon** 的 5 小时 & 周剩余百分比与重置倒计时。
* **右侧边栏（Sidecar）按需深度统计 — 零后台开销**：
  * **周额度总 Token 与费用估算**：汇总近 7 天本地实耗 Token、等价 API 费用与缓存节省，并在周配额已用占比 `>= 5%` 时按比例反推各分组**周额度总 Token 与总费用估算**。
  * **严格按需计算**：仅在用户打开右侧 `AGY HUD` 边栏面板时才扫描近 7 天日志并计算；**关闭或隐藏边栏时不在后台执行任何 7 天扫描或周额度计算**。
* **检查与自动更新**：在右侧 `AGY HUD` 设置页可手动检查更新、一键升级，或开启「定时自动检查」与「发现新版自动更新」（保留全部个人排序与设置）。
* **跨平台零侵入 CDP 启动器**：Windows 自动生成无黑窗桌面 `Antigravity (CDP).lnk`；macOS 自动在 `~/Applications/` 生成套壳 `Antigravity (CDP).app`（复用官方图标，不破坏苹果签名）。

---

## 🤖 方式一（推荐）：复制简短 Prompt 给你的 AI Agent

### 一键安装 Prompt
将下方文字直接复制发送给你的 AI Agent（详细步骤与输出教程规范已写在 [docs/AGENT_INSTALL.md](./docs/AGENT_INSTALL.md) 中）：

```text
请阅读 https://github.com/<你的用户名>/agy-hud 仓库里的 docs/AGENT_INSTALL.md，严格按其中的步骤帮我安装并配置 AGY HUD 插件；配置完成后，务必按文档要求给我输出一份清晰的使用教程。
```

### 一键卸载 Prompt
需要卸载时，直接复制下方文字给你的 AI Agent（详细规范见 [docs/AGENT_UNINSTALL.md](./docs/AGENT_UNINSTALL.md)）：

```text
请阅读 https://github.com/<你的用户名>/agy-hud 仓库里的 docs/AGENT_UNINSTALL.md，帮我卸载 AGY HUD 插件（如需连同配置与启动器彻底清理请使用 --purge-data）并告诉我清理结果。
```

---

## ⚡ 方式二：自己手动快捷配置教程

> **环境要求**：Node.js `>= 22.5.0`（可用 `node -v` 检查，**无需** `npm install`）。

### 1. 快捷安装

* **Windows**：下载仓库 ZIP 解压后直接**双击 `install.cmd`**；或在 PowerShell 执行：
  ```powershell
  git clone https://github.com/<你的用户名>/agy-hud.git && cd agy-hud && node scripts/install.mjs
  ```
* **macOS / Linux**：
  ```bash
  git clone https://github.com/<你的用户名>/agy-hud.git && cd agy-hud && chmod +x install.sh && ./install.sh
  ```

安装脚本会自动部署插件至 `~/.gemini/config/plugins/agy-hud`，并自动生成 CDP 启动器（Windows 为桌面 `Antigravity (CDP).lnk`，macOS 为 `~/Applications/Antigravity (CDP).app`）。

### 2. 开启并启动（2 步生效）

1. 打开 Antigravity → 左侧 **Customizations → Plugins** → 开启 **「AGY HUD」**。
2. **彻底退出** Antigravity（Windows 退出右下角托盘 / macOS 按 `Cmd + Q`），再双击刚生成的 **CDP 启动器** 重新打开即可在输入框左侧看到 HUD。

### 3. 自定义显示、顺序与自动更新

从右侧辅助边栏 `+` 菜单打开 **AGY HUD** 设置页：
* **自定义胶囊与浮层**：勾选显隐 + 拖拽（或点 `↑`/`↓`）调整任意顺序，实时生效。
* **检查与自动更新**：在「检查与自动更新」卡片中可点「检查更新 / 立即更新」，或打开「定时自动检查」「发现新版自动更新」开关。
* **免 CDP 兜底**：未走 CDP 启动器打开时，右侧边栏底部的「实时遥测快照」依然可以直接查看全部数据。

---

## 🗑️ 手动卸载教程

* **Windows**：双击根目录 **`uninstall.cmd`**（或运行 `node scripts/uninstall.mjs`）；
* **macOS / Linux**：运行 `./uninstall.sh`（或 `node scripts/uninstall.mjs`）。
* 如需连同个人配置和生成的 `.lnk` / `.app` 启动器一起彻底清除，加上 `--purge-data`：
  ```bash
  node scripts/uninstall.mjs --purge-data
  ```
卸载后直接改回官方原版快捷方式启动即可，不残留任何宿主文件修改。

---

## 🧱 开发、离线预览与开源致谢

```bash
npm test         # 运行全部离线单元测试
npm run preview  # 生成 preview-output/hud-preview.html，浏览器直接预览亮/暗主题与 Hover 卡片
```

本项目遵循 MIT 协议并复用了以下优秀开源社区模块（完整声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)）：
* [ahmetdotsh/agy-context](https://github.com/ahmetdotsh/agy-context)（MIT）— 上下文上限、构成拆解与本轮/总缓存命中率
* [ahmetdotsh/agy-usage](https://github.com/ahmetdotsh/agy-usage)（MIT）— 模型等价 API 费率表参考
* [aishadiaodeqishui/agy-monitor](https://github.com/aishadiaodeqishui/agy-monitor)（MIT）— 原生配额通道、速率算法、CDP 桥接、Windows 启动器与自更新机制
