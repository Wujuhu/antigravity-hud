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
       - **Windows**：桌面 `Antigravity (HUD).lnk`（默认端口 `9229`，无黑窗）
       - **macOS**：`~/Applications/Antigravity (HUD).app`（复用官方图标，不破坏代码签名）

4. **清理临时文件（必须执行）**
   - 安装命令成功返回后，**删除第 2 步创建的临时下载目录与 ZIP 文件**（若是自行克隆到临时目录的仓库也一并删除；注意**不要**误删用户自己原本克隆的开发目录）。
   - 插件已完整安装在 `~/.gemini/config/plugins/agy-hud/` 中，删除安装包后完全不影响正常运行与后续自动更新。

5. **安全边界**
   - **禁止**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。
   - **禁止**强行结束用户正在运行的 Antigravity 进程（由用户自行退出并重启）。

---

## 安装后向用户解释如何启用和使用

安装成功并清理完临时文件后，请向用户清楚解释如何启用和使用 AGY HUD，涵盖以下要点：

1. **开启插件**：在 Antigravity 左侧 **Customizations → Plugins** 中打开 **AGY HUD** 开关。
2. **重启并务必使用对应启动器打开（重点提醒）**：
   - 先**彻底退出** Antigravity（Windows 退出右下角托盘图标；macOS 按 `Cmd + Q`），避免单实例锁拦截启动参数。
   - 按用户当前操作系统给出明确入口（并展示安装脚本输出的准确路径）：
     - **Windows**：一定要通过桌面生成的 **`Antigravity (HUD).lnk`** 快捷方式打开 Antigravity。
     - **macOS**：一定要通过生成的 **`~/Applications/Antigravity (HUD).app`** 应用文件打开 Antigravity（可拖入程序坞方便日常使用）。
   - **务必明确提醒用户**：**以后每次启动都必须使用上述对应启动器，才能使用输入栏 HUD、悬停详情浮层、每轮底部总信息栏、界面排版调节等完整功能**；若直接从官方原版图标启动，页面注入功能将不会生效。
3. **日常使用**：
   - **输入框状态栏**：在权限按钮（如 `Turbo ▾`）左侧查看实时上下文占比、生成速度与 5h 额度；鼠标悬停展开上下文构成、缓存命中率与各分组 5h / 周额度详情，点击浮层右上角图标可一键打开右侧边栏。
   - **每轮对话汇总**：每轮回复底部与复制 / 点赞工具栏同行展示整轮模型、思考强度、缓存、耗时、生成速度、总 Token 与折合费用。
4. **右侧边栏设置**：
   - 通过悬浮窗右上角图标或右侧边栏 `+` 菜单打开 **AGY HUD** 面板。
   - 查看按需计算的**周额度估算**，在「HUD 数据与顺序」「界面排版」「更新」与「CDP 状态」中按需配置或检查更新。
5. **后续卸载**：
   - 直接参考 `docs/AGENT_UNINSTALL.md`（无需保留安装包目录即可完整卸载）。
