# AGY HUD

> 为 **Antigravity** 打造的跨平台极简输入栏遥测插件：通过 CDP 在聊天输入框「权限选择器」左侧注入紧凑状态胶囊，鼠标悬停即展开上下文构成、生成速率、本轮/总缓存命中率与全分组账号额度详情，并**支持完全自定义显示的数据项与排序**。
>
> **零外部 npm 依赖（仅需 Node.js >= 22.5.0）** · **不修改 `app.asar` 与宿主 `config.json`** · **同时支持 Windows（`.lnk` 快捷方式）与 macOS（套壳 `.app`）**

---

## 核心功能

* **输入栏常驻紧凑胶囊**：精准挂载在输入栏右侧权限选择器（如 `Turbo ▾`）正左侧，默认展示 **上下文圆环占比 · 实时生成速率 (`tok/s`) · 当前模型 5h 剩余额度**，自动随上下文占比与额度变化着色，窄屏自动折叠不挤输入框。
* **鼠标悬停（Hover）结构化详情浮层**：鼠标移到胶囊上即可平滑弹出毛玻璃卡片（自动适配深/浅主题、移入卡片不闪烁、点开原生下拉菜单自动避让）：
  * **上下文总览与 5 类构成拆解**：精确 Token / 会话窗口上限 + 分色比例条（系统底座 / 规则与技能 / 对话历史 / 工具输出 / 思考过程）。
  * **速率与 Prompt 缓存双列**：本轮实时速率、会话均值、本轮输出、**本轮缓存命中率**、**累计总缓存命中率**与会话累计总消耗。
  * **全分组原生账号额度**：同时展示 **Gemini / GPT&Claude / Argon** 的 5 小时与周剩余百分比及精确重置倒计时（当前对话所属分组高亮标识）。
* **完全自定义显示项与顺序**：内置极简右侧辅助边栏（`aux_pane`）设置页，支持对**常驻胶囊（6 项）**和**Hover 浮层（4 块）**自由**勾选显隐 + 拖拽 / 按钮调整顺序**，改动实时生效。
* **跨平台零侵入启动器**：
  * **Windows**：自动生成无黑窗桌面快捷方式 `Antigravity (CDP).lnk`。
  * **macOS**：自动在 `~/Applications/` 生成套壳 `Antigravity (CDP).app`（复用官方图标，不破坏苹果代码签名与自动更新）。

---

## 🤖 方式一（推荐）：复制这段 Prompt 给你的 AI Agent，让它一键帮你配置

直接复制下面整段文字发给你正在使用的 AI Agent（如 Antigravity / Claude Code / Codex 等），它会自动为你完成环境检查、安装部署与启动器生成，并在完成后输出专属使用教程：

```text
请帮我安装并配置开源 Antigravity 插件 `agy-hud`（仓库地址：https://github.com/<你的用户名>/agy-hud.git，如果我当前已经在本地克隆了该仓库则直接使用本地目录）。

请严格按以下步骤执行：
1. 检查当前操作系统（Windows / macOS / Linux）以及本机 Node.js 版本是否 >= 22.5.0；若版本过低或未安装，先暂停并给出对应系统的快捷升级命令。
2. 如本地尚未克隆仓库，先将其克隆到一个合适目录；然后进入仓库根目录运行 `node scripts/install.mjs` 完成安装（该脚本会自动将插件部署到 `~/.gemini/config/plugins/agy-hud`，并自动生成当前系统对应的 CDP 启动器：Windows 为桌面 `Antigravity (CDP).lnk`，macOS 为 `~/Applications/Antigravity (CDP).app`）。
3. 严禁修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。
4. 运行 `npm test` 确认所有单元测试通过（可选验证）。

⚠️【重要】配置完成后，请你务必整理并输出一份清晰易懂的《AGY HUD 使用教程》给我，必须包含：
- 如何在 Antigravity 左侧 `Customizations -> Plugins` 中打开 `AGY HUD` 开关；
- 如何**彻底退出**当前所有 Antigravity 进程（Windows 需退出系统托盘后台，macOS 需按 `Cmd + Q`）并通过刚生成的 CDP 启动器（给出实际生成的准确路径）重新打开，以及为什么要这样做；
- 如何确认输入栏胶囊生效、鼠标悬停查看详情浮层（上下文构成、本轮/总缓存命中率、速率、5h/周额度）；
- 如何在右侧辅助边栏打开 `AGY HUD` 设置页，自由勾选并拖拽调整胶囊数据项和浮层区块的显示顺序、修改 CDP 端口或切换上下文上限；
- 后续如何升级以及如何卸载插件。
```

---

## ⚡ 方式二：自己手动快捷配置教程

> **运行前提**：本机已安装 **Node.js >= 22.5.0**（可用 `node -v` 查看，无需执行 `npm install`）。

### 第 1 步：下载并一键安装

* **Windows（任选一种）**：
  * 下载仓库压缩包解压后，直接**双击根目录的 `install.cmd`**；
  * 或在 PowerShell 执行：
    ```powershell
    git clone https://github.com/<你的用户名>/agy-hud.git
    cd agy-hud
    node scripts/install.mjs
    ```
* **macOS / Linux**：
  ```bash
  git clone https://github.com/<你的用户名>/agy-hud.git
  cd agy-hud
  chmod +x install.sh && ./install.sh
  ```

安装脚本会自动完成两件事：
1. 将插件文件部署到 `~/.gemini/config/plugins/agy-hud/`；
2. 自动生成当前系统的 CDP 启动器：
   * **Windows**：桌面 `Antigravity (CDP).lnk`（默认端口 `9229`，无黑窗）
   * **macOS**：`~/Applications/Antigravity (CDP).app`（可直接拖入程序坞 Dock 或通过 Spotlight 启动）

### 第 2 步：在 Antigravity 中开启插件

打开 Antigravity → 左侧 **Customizations → Plugins** → 打开 **「AGY HUD」** 开关。

### 第 3 步：用 CDP 启动器重启一次即可生效

1. **彻底退出**当前正在运行的 Antigravity：
   * **Windows**：关闭窗口后，右键右下角系统托盘图标选择退出（确保任务管理器中无残留 `Antigravity.exe`）；
   * **macOS**：按 `Cmd + Q` 彻底退出。
2. 双击刚生成的 **`Antigravity (CDP).lnk`**（Windows）或 **`Antigravity (CDP).app`**（macOS）重新启动。
3. 进入任意对话，即可在输入栏权限按钮左侧看到紧凑胶囊，将鼠标移上去即可展开完整 Hover 详情卡！

---

## 🎨 自定义显示数据与顺序

点击 Antigravity 右侧辅助边栏 `+` 菜单打开 **AGY HUD** 设置页，即可随时拖拽（或点击 `↑` / `↓`）自由定制：

| 区域 | 支持的数据项 / 区块 | 默认状态 |
| :--- | :--- | :--- |
| **输入栏常驻胶囊** | `上下文占用（支持仅%/仅Token/%+Token）`、`实时生成速率`、`当前模型 5h 额度` | 默认开启（可重排） |
| **输入栏常驻胶囊（可选）** | `本轮缓存命中率`、`会话累计消耗`、`真实上游模型` | 默认关闭（可勾选并拖至任意位置） |
| **Hover 详情浮层** | `上下文总览进度条`、`上下文 5 类构成拆解`、`速率与 Prompt 缓存双列`、`全分组账号剩余额度` | 默认全部开启（可自由开关与重排） |

> 即使临时未通过 CDP 启动器打开 Antigravity，右侧 **AGY HUD** 边栏底部的「实时遥测快照」依然可以直接查看全部上下文、速率、缓存和配额数据。

---

## 🧱 项目结构与开源致谢

本项目遵循极简复用原则，整合了以下 MIT 开源社区项目的成熟模块（完整许可证见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)）：

* **上下文上限、构成拆解与本轮/总缓存命中率**：复用自 [ahmetdotsh/agy-context](https://github.com/ahmetdotsh/agy-context)（MIT）
* **原生 5h/周配额读取、速率算法、CDP 目标发现与 Windows 启动器**：复用并精简改造自 [aishadiaodeqishui/agy-monitor](https://github.com/aishadiaodeqishui/agy-monitor)（MIT）
* **本项目定制新增**：macOS 套壳 `.app` 启动器生成器、全平台 CDP 放行、自定义数据与顺序驱动引擎、输入栏极简胶囊与 Hover 详情浮层。

---

## 🧪 开发、离线预览与卸载

```bash
# 运行离线单元测试（无需外部依赖）
npm test

# 生成离线交互式 UI 预览页（在浏览器打开 preview-output/hud-preview.html 即可体验亮/暗主题与 Hover 卡片）
npm run preview

# 卸载插件（保留个人排序配置）
node scripts/uninstall.mjs

# 彻底卸载插件并清除本地配置与生成的启动器
node scripts/uninstall.mjs --purge-data
```

Windows 也可直接双击 `uninstall.cmd`，macOS / Linux 可运行 `./uninstall.sh`。

---

## 🔒 安全与零侵入说明

* **不修改核心文件**：绝不修改 Antigravity 安装目录、`app.asar` 或全局 `~/.gemini/config/config.json`。
* **本地只读**：仅只读解析本地会话日志与平台注入的本机回环配额通道，所有配置保存在 `~/.gemini/antigravity/plugin_data/agy-hud/`，绝不上传任何数据。
* **CDP 端口提示**：`--remote-debugging-port` 仅绑定本机回环地址 `127.0.0.1`，请勿将其端口转发到局域网或公网；不需要输入栏注入时，可随时改回官方原版快捷方式启动并在设置页关闭 CDP 开关。
