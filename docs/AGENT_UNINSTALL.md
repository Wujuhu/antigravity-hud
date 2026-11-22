# AGY HUD — AI Agent 卸载指南

本文件供 AI Agent 在协助用户卸载 **AGY HUD** 时阅读并执行。**无需保留原安装包目录**，直接按以下路径清理即可。

---

## 执行步骤

1. **确认清理范围（若用户未明确说明）**
   - **常规卸载（默认）**：仅移除插件目录 `~/.gemini/config/plugins/agy-hud`，保留个人配置（方便日后重装）。
   - **彻底卸载**：同时移除用户数据目录 `~/.gemini/antigravity/plugin_data/agy-hud` 与生成的启动器：
     - **Windows**：桌面 `Antigravity (HUD).lnk`
     - **macOS**：`/Applications/Antigravity (HUD).app`（以及兼容清理旧版 `~/Applications/Antigravity (HUD).app`）和桌面 `~/Desktop/Antigravity (HUD)`（或 `.app` 快捷方式）

2. **执行卸载**
   - 若本地存在安装包目录，可运行 `node scripts/uninstall.mjs`（彻底清理加 `--purge-data`）。
   - 若已删除安装包目录，直接按上述路径安全删除对应目录与启动器文件即可（若存在旧名 `Antigravity (CDP).lnk` / `Antigravity (CDP).app` 也一并清理）。
   - **严禁**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。

3. **向用户反馈卸载结果**
   - 明确列出已删除的插件目录、配置目录（或说明已保留）与启动器路径。
   - 提醒用户：之后直接改回 Antigravity **官方原版快捷方式 / 应用图标**启动即可，不残留任何宿主文件改动。
