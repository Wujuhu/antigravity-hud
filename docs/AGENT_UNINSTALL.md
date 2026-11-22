# AGY HUD — AI Agent 自动化卸载指南

本文件供 AI Agent 在帮用户卸载 **AGY HUD** 时直接阅读并执行。

---

## 执行步骤

1. **确认清理范围（若用户未明确说明）**
   - **常规卸载（默认）**：仅移除插件目录 `~/.gemini/config/plugins/agy-hud`，保留个人自定义排序配置（方便日后重装）。
   - **彻底卸载（`--purge-data`）**：同时删除 `~/.gemini/antigravity/plugin_data/agy-hud` 以及生成的 CDP 启动器（Windows 桌面 `Antigravity (CDP).lnk` 或 macOS `~/Applications/Antigravity (CDP).app`）。

2. **执行卸载**
   - 若本地存在 `antigravity-hud` 仓库目录，进入根目录执行：
     - 常规卸载：`node scripts/uninstall.mjs`
     - 彻底卸载：`node scripts/uninstall.mjs --purge-data`
   - 若本地已删除源码仓库，可直接按上述路径安全移除对应目录与启动器文件。
   - **严禁**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。

3. **向用户反馈卸载结果**
   - 明确列出已删除的插件目录、配置目录（或说明已保留）与 CDP 启动器路径。
   - 提醒用户：之后直接改回 Antigravity **官方原版快捷方式**启动即可，完全不残留任何宿主文件改动。
