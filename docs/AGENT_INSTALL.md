# AGY HUD — AI Agent 安装指南

本文件供 AI Agent 在协助用户安装和配置 **AGY HUD** 时阅读并执行。

---

## 执行步骤

1. **检查运行环境**
   - 识别当前操作系统（Windows / macOS / Linux）。
   - 检查本机 Node.js 版本（`node -v`），确认 **Node.js >= 22.5.0**。
   - 若未安装或版本过低，请暂停安装并向用户提供对应系统的升级方式（如 Windows `winget install OpenJS.NodeJS.LTS`、macOS `brew install node`）。

2. **获取仓库并执行安装**
   - 若用户尚未克隆仓库，将 `https://github.com/Wujuhu/antigravity-hud.git` 克隆至本地目录（如 `~/antigravity-hud` 或当前工作区）。
   - 进入仓库根目录运行：
     ```bash
     node scripts/install.mjs
     ```
   - 说明：
     - 零外部 npm 依赖，无需运行 `npm install`。
     - 自动部署插件至 `~/.gemini/config/plugins/agy-hud/`。
     - 自动初始化或保留 `~/.gemini/antigravity/plugin_data/agy-hud/config.json`。
     - 自动生成当前系统的 CDP 启动器：
       - **Windows**：桌面 `Antigravity (HUD).lnk`（默认端口 `9229`，无黑窗）
       - **macOS**：`~/Applications/Antigravity (HUD).app`（套壳启动器，复用官方图标，不破坏代码签名）

3. **安全边界**
   - **禁止**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。
   - **禁止**强行结束用户正在运行的 Antigravity 进程（由用户自行退出并重启）。

4. **可选验证**
   - 在仓库目录运行 `npm test`，确认单元测试通过。

---

## 安装后回复要点

安装成功后，请向用户简要说明以下启用与使用方法：

1. **开启插件**：在 Antigravity 左侧 **Customizations → Plugins** 中开启 **AGY HUD**。
2. **重启生效**：
   - 先**彻底退出** Antigravity（Windows 退出右下角托盘图标；macOS 按 `Cmd + Q`），避免单实例锁拦截启动参数。
   - 使用本次生成的启动器重新打开（请附上安装脚本输出的完整启动器路径）。
3. **日常使用**：
   - **输入栏 HUD**：在权限按钮（如 `Turbo ▾`）左侧查看实时上下文占比、纯流式速率与 5h 额度；鼠标悬停展开上下文构成、缓存命中率与全分组 5h / 周额度详情，点击浮层右上角图标可一键打开右侧边栏。
   - **每轮底部总信息栏**：每轮回复底部与复制 / 点赞工具栏同行展示整轮模型、思考强度、缓存、耗时、TPS、总 Token 与等价金额。
4. **右侧边栏设置**：
   - 通过悬浮窗右上角图标或右侧边栏 `+` 菜单打开 **AGY HUD** 面板。
   - 查看按需计算的**周额度估算**，在「HUD 数据与顺序」「界面排版」「更新」与「CDP 状态」中按需配置或检查更新。
5. **后续卸载**：
   - 运行 `node scripts/uninstall.mjs`（保留配置）或 `node scripts/uninstall.mjs --purge-data`（彻底清除配置与启动器），亦可参考 `docs/AGENT_UNINSTALL.md`。
