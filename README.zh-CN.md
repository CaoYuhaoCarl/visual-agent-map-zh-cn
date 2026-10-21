# Visual Agent Map

[English](README.md) · [繁體中文](README.zh-TW.md) · **简体中文**

### 在 Obsidian 中，用可视化 AI 地图探索问题

**从一个问题出发，看清各个部分，再追踪值得探索的线索。**
建立可视化研究地图，让 AIM 深入查证问题，或到 Coffee Tables 聊出新角度。
保留的内容都是仓库中可编辑的 Markdown。

[**开始使用**](#开始使用) · [查看 0.23.0 正式版](https://github.com/kevcltsai/visual-agent-map/releases/tag/0.23.0) · [安装指南](INSTALL.md)

![Obsidian 中的 Visual Agent Map 研究地图示例，显示相连的议题卡片](assets/screenshots/map-overview.png)

## 三种探索方式

- **可视化地图。**
  把问题拆成议题，用 AI 深入研究任何分支。
  可以草拟多层大纲、审核建议后再添加，选择笔记风格（例如教科书）、合并相关议题，也能在后台同时研究多个议题。
  手动绘图不需要 AI。
- **AIM - Adaptive Inquiry Map。**
  提供问题与背景，一次回答开头的条件问题，然后让它继续研究。
  在地图上查看各子议题的进度，最后得到附有来源的文档。
- **Coffee Tables。**
  带来尚未成形的想法，与模拟的 AI 来宾对话，再回看观察者整理的洞见。

## 开始使用

1. 在 **Obsidian 桌面版 → 设置 → 第三方插件 → 浏览** 搜索 **Visual Agent Map**，安装并启用。
   需要桌面版 Obsidian **1.13.7+**。
2. 打开内置示例，或创建自己的地图。
   使用 AI 功能前，安装并登录 [Codex CLI](https://developers.openai.com/codex/cli/) 或 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)，再到 VAM 设置检查 CLI。
3. 选择「**＋ 添加思维导图 → 添加 AIM**」体验 AIM。

详细设置、故障排除与已知限制见 [INSTALL.md](INSTALL.md)。

## 语言

在 **Settings → Visual Agent Map → 界面语言** 选择 **English**、**繁體中文** 或 **简体中文**。
全新安装默认英文；选择会保存，且独立于 Obsidian 的语言设置。
VAM 与 Coffee Tables 的界面文字和内置示例会跟随此设置。
已有地图、笔记、对话与自定义提示词不会自动翻译。
每次 AI 任务的回答语言可单独选择。
AIM 创建地图时，依次从问题、背景判断内容语言。
只有简繁共用字或简繁特征相同时，沿用中文界面语言；英文界面则保留原有的繁体中文回退行为。
保存后的地图内容语言不会随界面切换而改变。

## 贡献检查

- `npm run verify` 与 CI 运行同一组检查（lint、格式、测试、已提交产物）。
- 运行 `git config core.hooksPath .githooks`，每次 push 前会自动检查。
- 不要用 `--no-verify` 跳过检查。

## 隐私

VAM 没有遥测，也不保存 API key。
AI 任务会通过本机 CLI 将相关内容发送至 OpenAI 或 Anthropic，可能使用账号额度或产生费用。

## 致谢与许可

AIM 的研究方式参考 [MindSearch](https://github.com/InternLM/MindSearch) 与 [Chen 等人（2024）的论文](https://arxiv.org/abs/2407.20183)。
VAM 是独立实现；此说明不代表隶属或获得原项目背书。
代码采用 Apache-2.0 许可，但 Visual Agent Map 的名称与标志不在许可范围内，fork 请使用自己的名称（见 [NOTICE](NOTICE)）。

[报告问题](https://github.com/kevcltsai/visual-agent-map/issues) · [版本记录](CHANGELOG.md) · [Apache-2.0](LICENSE)

Copyright © 2026 Kevin Tsai
