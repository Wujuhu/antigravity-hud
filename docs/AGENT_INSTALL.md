# AGY HUD — AI Agent 自动化安装与配置指南

本文件供 AI Agent 在帮用户安装和配置 **AGY HUD** 时直接阅读并严格执行。

---

## 执行步骤

1. **检查运行环境**
   - 识别当前操作系统（Windows / macOS / Linux）。
   - 检查本机 Node.js 版本（`node -v`），确认 **Node.js >= 22.5.0**。
   - 若未安装或版本过低，请暂停安装并向用户提供对应系统的升级方式（如 Windows `winget install OpenJS.NodeJS.LTS`、macOS `brew install node`）。

2. **获取仓库并执行一键安装**
   - 若用户尚未在本地克隆本仓库，将其克隆到一个干净的本地目录（如 `~/agy-hud` 或当前工作区）。
   - 进入仓库根目录运行：
     ```bash
     node scripts/install.mjs
     ```
   - 说明：
     - 该命令**零外部 npm 依赖**，无需运行 `npm install`。
     - 它会自动将插件文件部署至 `~/.gemini/config/plugins/agy-hud/`。
     - 它会自动初始化或保留 `~/.gemini/antigravity/plugin_data/agy-hud/config.json`（自动识别 GitHub 仓库地址以支持检查与自动更新）。
     - 它会自动生成当前系统对应的零侵入 CDP 启动器：
       - **Windows**：桌面 `Antigravity (CDP).lnk`（默认端口 `9229`，无黑窗）
       - **macOS**：`~/Applications/Antigravity (CDP).app`（套壳启动器，复用官方图标，不破坏代码签名）

3. **严格安全边界（必须遵守）**
   - **禁止**修改 Antigravity 安装目录、`app.asar` 或手动编辑 `~/.gemini/config/config.json`。
   - **禁止**强行杀掉用户正在运行中的 Antigravity 进程（由用户自行彻底退出并重启）。

4. **可选验证**
   - 在仓库目录运行 `npm test`，确认全部离线单元测试通过。

---

## ⚠️ 必须完成：向用户输出《AGY HUD 使用教程》

安装命令成功返回后，请**务必**向用户输出一份清晰、简洁、面向终端用户的《AGY HUD 使用教程》，必须覆盖以下 5 点：

1. **开启插件开关**：打开 Antigravity → 左侧 **Customizations → Plugins** → 打开 **「AGY HUD」** 开关。
2. **用 CDP 启动器重启生效（含原因）**：
   - 先**彻底退出**所有 Antigravity 进程（Windows 需退出右下角系统托盘图标；macOS 需按 `Cmd + Q`），因为 Electron 单实例锁会拦截带参数的二次启动。
   - 双击本次生成的 CDP 启动器（**请把安装脚本输出的准确路径展示给用户**）重新打开 Antigravity。
3. **日常查看方式**：
   - 在输入栏权限按钮（如 `Turbo ▾`）左侧查看紧凑胶囊（默认展示：上下文圆环占比 · 实时生成速率 · 当前模型 5h 剩余额度）。
   - 将鼠标悬停（Hover）在胶囊上，展开轻量化详情浮层：查看 5 类上下文构成、本轮/累计总缓存命中率、实时/平均速率与全分组 5h/周额度及重置倒计时。
4. **右侧边栏（Sidecar）深度数据、自定义排序与自动更新**：
   - 从右侧辅助边栏 `+` 菜单打开 **AGY HUD** 面板；
   - 查看**周额度总 Token 与费用估算**（近 7 天实耗、缓存节省及周容量推算——该计算仅在打开此边栏时按需运行，关闭面板时零后台开销）；
   - 对常驻胶囊项和 Hover 浮层区块自由**勾选显隐**与**拖拽 / 点 `↑` `↓` 调整顺序**；
   - 在「检查与自动更新」卡片中开启定时检查更新或发现新版自动更新。
5. **免 CDP 兜底提示**：若某次直接从原版快捷方式启动，输入栏不会出现胶囊，但右侧 **AGY HUD** 边栏底部的「实时遥测快照」依然可以直接查看所有数据。
