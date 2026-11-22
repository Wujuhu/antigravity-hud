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

3. **执行安装脚本并核验启动器**
   - 找到解压目录中包含 `scripts/install.mjs` 的子目录（通常为 `agy-hud` 或 `antigravity-hud-main`），进入后运行：
     ```bash
     node scripts/install.mjs
     ```
   - 该命令会自动完成以下工作（零外部 npm 依赖）：
     - 将插件本体复制至 `~/.gemini/config/plugins/agy-hud/`；
     - 初始化或保留用户配置目录 `~/.gemini/antigravity/plugin_data/agy-hud/`；
     - 自动生成当前系统的启动器：
       - **Windows**：在桌面生成 **`Antigravity (HUD).lnk`** 快捷方式（默认端口 `9229`，无黑窗）。
       - **macOS**：将启动器安装在根路径应用程序列表中——**`/Applications/Antigravity (HUD).app`**（复用官方图标，不破坏代码签名），同时在桌面 **`~/Desktop/`** 下新增一个指向 `/Applications/Antigravity (HUD).app` 的快捷方式（优先 Finder 替身，回退软链接）。请确认两处均已生成。

4. **清理临时文件（必须执行）**
   - 安装命令成功返回后，**删除第 2 步创建的临时下载目录与 ZIP 文件**（若是自行克隆到临时目录的仓库也一并删除；注意**不要**误删用户自己原本克隆的开发目录）。
   - 插件已完整安装在 `~/.gemini/config/plugins/agy-hud/` 中，删除安装包后完全不影响正常运行与后续自动更新。

5. **安全边界**
   - **禁止**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。
   - **禁止**强行结束用户正在运行的 Antigravity 进程（由用户自行退出并重启）。

---

## 安装后回复要求

安装成功并清理完临时文件后，请严格按以下两部分结构回复用户：

### 第一部分：如何启用（简洁直接）
- **无需**让用户再去 Antigravity 的 Plugins 菜单手动开启插件，直接提示用户按以下一步完成启用：
  1. 先**完整退出**正在运行的 Antigravity（Windows 需退出右下角托盘图标；macOS 需按 `Cmd + Q`）。
  2. 通过本次生成的对应启动器重新打开 Antigravity（附上实际生成的路径）：
     - **Windows**：双击桌面 **`Antigravity (HUD).lnk`** 快捷方式。
     - **macOS**：打开 **`/Applications/Antigravity (HUD).app`** 或桌面指向它的快捷方式。
  3. **重点提醒**：以后每次启动都必须通过对应的启动器打开 Antigravity，才能使用完整功能；从官方原版图标打开时页面增强功能不会生效。

### 第二部分：另起一行单独向用户介绍插件功能（必须输出）
在启用步骤之后，**必须另起一行**单独向用户清晰介绍 AGY HUD 的主要功能，至少覆盖以下全部内容：
- **每轮对话完成后的总信息栏**：位于每条回复下方、与复制和点赞按钮同一行，汇总展示本轮使用的模型、思考强度、缓存命中率、总耗时、生成速度、Token 用量与折合费用。
- **输入框下方的 HUD 数据**：常驻在输入框权限按钮左侧，实时显示上下文占比、生成速度与 5h 剩余额度，切换对话自动跟随。
- **鼠标悬停在 HUD 上的悬浮栏**：将鼠标移到 HUD 上即可展开详情卡，查看上下文各部分占比（系统 / 规则 / 对话 / 工具 / 思考，含压缩次数）、速率与缓存命中统计、各模型分组的 5h / 周剩余额度及重置倒计时，点击右上角图标还可一键打开右侧边栏。
- **右侧边栏功能**：简要介绍以下三项核心能力：
  - **周额度估算**：打开边栏时按需估算各模型分组近 7 天的已消耗量与周额度总量；
  - **HUD 自定义**：自由勾选显示项、拖拽调整顺序，并可配置上下文显示格式与窗口上限；
  - **自定义界面排版**：提供舒适、原版、紧凑三档预设，支持行间距、段间距、列表间距微调以及每轮底部总信息栏开关（侧边栏内也内置了自动检查更新与 CDP 状态显示）。
