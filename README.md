<div align="center">

<img src="assets/logo.svg" width="64" height="64" alt="AGY HUD Logo" />

# AGY HUD

**Antigravity 轻量输入栏遥测与界面增强插件**

实时查看上下文构成、纯流式生成速率、缓存命中率、5h / 周额度与每轮对话汇总，支持界面排版微调与按需周额度估算。

[![Release](https://img.shields.io/github/v/release/Wujuhu/antigravity-hud?style=flat-square&color=2563eb)](https://github.com/Wujuhu/antigravity-hud/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-111827?style=flat-square)](#安装)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.5.0-16a34a?style=flat-square)](#安装)
[![License](https://img.shields.io/github/license/Wujuhu/antigravity-hud?style=flat-square)](./LICENSE)

</div>

---

## 核心功能

- **输入栏 HUD**：嵌入权限按钮左侧，默认无边框融入原生输入栏，悬停时浮现柔和边框。默认显示上下文占用、纯流式 TPS 与 5h 额度，可自由增删与排序（支持周额度、缓存命中率、会话总计、上游模型），切换对话自动跟随。
- **悬停详情浮层**：悬停 HUD 展开五色合体上下文构成条（系统 / 规则 / 对话 / 工具 / 思考，含压缩次数）、速率与缓存命中统计、全分组 5h / 周圆环额度及重置倒计时，右上角支持一键打开右侧边栏。
- **每轮底部总信息栏**：与复制 / 点赞工具栏同行排布，汇总展示整轮调用的模型、思考强度、缓存命中率、总耗时、流式 TPS、总 Token 与等价金额，窄屏自动折行。
- **界面排版调节**：提供 **舒适 / 原版 / 紧凑** 三档一键切换，并支持行间距、段间距与列表间距滑块实时微调。
- **右侧设置边栏**：仅在打开边栏时按需计算各分组近 7 天已消耗与周额度估算；内置 GitHub Releases 检查与无损自动更新。
- **零侵入、跨平台**：不修改 `app.asar` 与 `config.json`，零外部 npm 依赖，原生支持 Windows 与 macOS。

---

## 界面预览

> 以下界面示意图使用脱敏 Mock 数据生成，展示各状态下的实际视觉样式。

### 输入栏 HUD 与每轮底部总信息栏
![输入栏 HUD 与每轮底部总信息栏](docs/screenshots/01-hud-and-turn-summary.png)

### 悬停 HUD 详情浮层
![悬停 HUD 详情浮层](docs/screenshots/02-hud-hover-popover.png)

### 右侧 AGY HUD 设置边栏
![右侧 AGY HUD 设置边栏](docs/screenshots/03-sidecar-panel.png)

---

## 安装

> 环境要求：Node.js `>= 22.5.0`（零外部依赖，无需 `npm install`）。

### 方式一：AI Agent 自动安装（推荐）

将下方指令发送给你的 AI Agent 即可：

```text
请按 https://github.com/Wujuhu/antigravity-hud/blob/main/docs/AGENT_INSTALL.md 安装 AGY HUD。
```

### 方式二：手动安装

- **Windows**：下载 [Latest Release ZIP](https://github.com/Wujuhu/antigravity-hud/releases/latest) 解压后双击 `install.cmd`，或在 PowerShell 中运行：
  ```powershell
  git clone https://github.com/Wujuhu/antigravity-hud.git && cd antigravity-hud && node scripts/install.mjs
  ```
- **macOS / Linux**：
  ```bash
  git clone https://github.com/Wujuhu/antigravity-hud.git && cd antigravity-hud && chmod +x install.sh && ./install.sh
  ```

安装脚本会自动部署插件至 `~/.gemini/config/plugins/agy-hud`，并生成当前系统的 CDP 启动器（Windows 为桌面 `Antigravity (HUD).lnk`，macOS 为 `~/Applications/Antigravity (HUD).app`）。

### 启用生效

1. 在 Antigravity 左侧 **Customizations → Plugins** 中开启 **AGY HUD**。
2. 彻底退出 Antigravity（Windows 退出右下角托盘 / macOS 按 `Cmd + Q`），再用刚生成的 `Antigravity (HUD)` 启动器重新打开即可。

---

## 卸载

- **AI Agent 卸载**：
  ```text
  请按 https://github.com/Wujuhu/antigravity-hud/blob/main/docs/AGENT_UNINSTALL.md 卸载 AGY HUD。
  ```
- **手动卸载**：
  - Windows 双击 `uninstall.cmd`；macOS / Linux 运行 `./uninstall.sh`（默认保留配置）。
  - 如需连同配置与启动器一并清除：
    ```bash
    node scripts/uninstall.mjs --purge-data
    ```

---

## 开发与开源致谢

```bash
npm test         # 运行离线单元测试
npm run preview  # 生成亮/暗主题离线预览页
```

本项目基于 MIT 协议开源，部分模块参考或改编自以下项目（详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)）：
- [ahmetdotsh/agy-context](https://github.com/ahmetdotsh/agy-context)（MIT）
- [ahmetdotsh/agy-usage](https://github.com/ahmetdotsh/agy-usage)（MIT）
- [aishadiaodeqishui/agy-monitor](https://github.com/aishadiaodeqishui/agy-monitor)（MIT）
- [nkjDSLcvanv/antigravity-codex-theme](https://github.com/nkjDSLcvanv/antigravity-codex-theme)（MIT）
- [WhiteBr1ck/agy-powertools](https://github.com/WhiteBr1ck/agy-powertools)（MIT）
