# AGY HUD — AI Agent 安装指南

本文件供 AI Agent 在协助用户安装和配置 **AGY HUD** 时阅读并执行。

> **免 Git、零残留**：插件安装后会将全部运行文件复制至 Antigravity 官方插件目录（`~/.gemini/config/plugins/agy-hud/`），运行过程**不依赖**下载或解压的临时目录。无需安装 Git，安装完成后请自动删除临时下载文件。

---

## 执行步骤

1. **检查运行环境**
   - 识别当前操作系统（Windows / macOS / Linux）。
   - 检查本机 Node.js 版本（`node -v`），确认 **Node.js >= 22.5.0**（无需 Git，也无需 `npm install`）。
   - 若未安装或版本过低，请暂停安装并向用户提供对应系统的安装/升级方式（Windows：`winget install OpenJS.NodeJS.LTS`；macOS：`brew install node`）。

2. **下载安装包至临时目录并解压（推荐 ZIP，无需 Git）**
   - 在系统临时目录中创建一个临时文件夹（例如 `agy-hud-install`），优先下载最新 Release 的 `.zip` 附件（若 API 限流或不可达，可回退下载主分支 ZIP `https://github.com/Wujuhu/antigravity-hud/archive/refs/heads/main.zip`）：
     - **Windows (PowerShell)**：
       ```powershell
       $tmp = Join-Path $env:TEMP "agy-hud-install"
       Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
       New-Item -ItemType Directory -Path $tmp | Out-Null
       $zip = Join-Path $tmp "agy-hud.zip"
       try {
         $rel = Invoke-RestMethod "https://api.github.com/repos/Wujuhu/antigravity-hud/releases/latest" -Headers @{ "User-Agent" = "agy-hud-installer" }
         $url = ($rel.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1).browser_download_url
       } catch { $url = $null }
       if (-not $url) { $url = "https://github.com/Wujuhu/antigravity-hud/archive/refs/heads/main.zip" }
       Invoke-WebRequest -Uri $url -OutFile $zip
       Expand-Archive -Path $zip -DestinationPath $tmp -Force
       ```
     - **macOS / Linux (Bash/Zsh)**：
       ```bash
       TMP_DIR="$(mktemp -d /tmp/agy-hud-install.XXXXXX)"
       ZIP_PATH="$TMP_DIR/agy-hud.zip"
       URL="$(curl -fsSL -H 'User-Agent: agy-hud-installer' https://api.github.com/repos/Wujuhu/antigravity-hud/releases/latest 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const a=(d.assets||[]).find(x=>/\.zip$/i.test(x.name||'')); console.log(a?a.browser_download_url:'');" 2>/dev/null || true)"
       [ -z "$URL" ] && URL="https://github.com/Wujuhu/antigravity-hud/archive/refs/heads/main.zip"
       curl -fSL "$URL" -o "$ZIP_PATH"
       unzip -q "$ZIP_PATH" -d "$TMP_DIR"
       ```

3. **执行安装脚本**
   - 找到解压目录中包含 `scripts/install.mjs` 的子目录（通常为 `agy-hud` 或 `antigravity-hud-main`），进入后运行：
     ```bash
     node scripts/install.mjs
     ```
   - 该命令会自动完成以下工作（零外部 npm 依赖）：
     - 将插件本体复制至 `~/.gemini/config/plugins/agy-hud/`；
     - 初始化或保留用户配置目录 `~/.gemini/antigravity/plugin_data/agy-hud/`；
     - 自动生成当前系统的 CDP 启动器：
       - **Windows**：在桌面生成 `Antigravity (HUD).lnk`（默认端口 `9229`，无黑窗）
       - **macOS**：在系统根目录下的应用程序列表生成 **`/Applications/Antigravity (HUD).app`**（若 `/Applications` 无写入权限则自动回退 `~/Applications/Antigravity (HUD).app`），并**在桌面新增指向该 `.app` 的快捷方式 `~/Desktop/Antigravity (HUD).app`**（复用官方图标，不破坏代码签名）。

4. **清理临时文件（必须执行）**
   - 安装命令成功返回后，**删除第 2 步创建的临时下载目录与 ZIP 文件**（若是自行克隆到临时目录的仓库也一并删除；注意**不要**误删用户自己原本克隆的开发目录）。
   - 插件已完整安装在 `~/.gemini/config/plugins/agy-hud/` 中，删除安装包后完全不影响正常运行与后续自动更新。

5. **安全边界**
   - **禁止**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。
   - **禁止**强行结束用户正在运行的 Antigravity 进程（由用户自行退出并重启）。

---

## 安装后向用户解释如何启用和使用

安装成功并清理完临时文件后，请向用户清楚说明启用方式，并**另起一行单独介绍插件功能**：

### 第一部分：如何启用（一步生效）
- 无需先进入 Antigravity 手动开启 Plugins 开关，只需直接：
  1. 先**彻底退出** Antigravity（Windows 退出右下角托盘图标；macOS 按 `Cmd + Q`），避免单实例锁拦截启动参数。
  2. 按用户当前操作系统通过生成的对应启动器重新打开（附上安装脚本输出的准确路径）：
     - **Windows**：双击桌面生成的 **`Antigravity (HUD).lnk`** 快捷方式打开 Antigravity。
     - **macOS**：打开 **`/Applications/Antigravity (HUD).app`** 或桌面快捷方式 **`~/Desktop/Antigravity (HUD).app`** 启动 Antigravity。
- **务必明确提醒用户**：**以后每次使用都必须通过上述对应启动器打开 Antigravity，才能使用完整功能**；若从官方原版图标打开，输入框 HUD 等界面功能不会生效。

### 第二部分：插件功能介绍（必须另起一行单独向用户说明）
请在回复中另起一行，简明清晰地向用户介绍以下核心功能：

- **每轮对话底部的总信息栏**：每条回复下方与复制、点赞按钮同一行，自动汇总展示本轮使用的模型、思考强度、缓存命中率、总耗时、生成速度（tok/s）、总 Token 用量与折合费用。
- **输入框底部的 HUD 数据**：位于输入框右下角权限按钮（如 `Turbo ▾`）左侧，实时展示当前对话的上下文占用占比、生成速度与 5h 剩余额度，切换对话自动更新。
- **鼠标悬停在 HUD 上的悬浮栏**：将鼠标移到输入框 HUD 上即可展开详情浮层，查看上下文各部分占比（系统 / 规则 / 对话 / 工具 / 思考及压缩次数）、本轮与会话缓存命中率、历史均速、各模型分组的 5h / 周剩余额度与重置倒计时，点击浮层右上角图标可一键打开右侧边栏。
- **右侧 AGY HUD 边栏**：
  - **周额度估算**：打开边栏时按需扫描估算各模型分组近 7 天的已消耗与周额度总量，平时不占后台资源；
  - **HUD 自定义**：自由勾选输入框 HUD 要显示的指标，并支持拖拽或按钮调整显示顺序；
  - **自定义界面排版**：提供舒适、原版、紧凑三档预设，并可通过滑块自由微调行间距、段间距和列表间距（另支持开关每轮底部总信息栏、检查与自动更新）。
- **后续卸载提示**：告知用户日后如需卸载，无需保留安装包，直接参考 `docs/AGENT_UNINSTALL.md` 即可清理。
