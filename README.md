# CueProof · 字幕交付检查

CueProof 对比一份原稿和一份待交付字幕，以时间范围显示哪里少了字幕覆盖，哪里多出了字幕。交付稿把原稿的一条字幕拆成两条，只要覆盖的播放时段一致，核对结果就一致。

[在线试用](https://thitrang20160-cell.github.io/cueproof/) · [下载离线版](https://github.com/thitrang20160-cell/cueproof/releases/latest) · [提交试用反馈](https://github.com/thitrang20160-cell/cueproof/issues)

## 试用

在桌面浏览器打开 `index.html`。点 **试用样例**，或选择自己的两份 SRT / WebVTT 文件。默认只列出 250 毫秒及以上的差异，覆盖率仍统计所有时长。偏移只改变交付稿在预览和报告里的时间。CSV 包含差异类型、时间及本轮参数。

试用页由 GitHub Pages 提供，字幕在浏览器本机读取和核对，无需登录。应用不上传字幕，也不采集试用数据。支持 UTF-8 和带 BOM 的 UTF-16，单个文件最多 4 MiB。可见字幕的重叠时段只计一次。结果衡量原稿字幕时间覆盖，翻译语义和实际音画同步需要复核。

## 需求证据

| 候选方向 | 公开问题或已有方案 | 首轮判断 |
| --- | --- | --- |
| 字幕交付时间检查 | [原稿与译稿可能需要拆分成不同数量的字幕](https://github.com/SubtitleEdit/subtitleedit/discussions/5223)，[原稿和译稿时间冲突会影响处理](https://github.com/SubtitleEdit/subtitleedit/issues/2201)，[用户仍在讨论重叠字幕处理](https://github.com/SubtitleEdit/subtitleedit/issues/15357) | 做独立的只读覆盖检查，验证正常拆分不误报，并为异常输出准确时段。 |
| AI 翻译插值占位符检查 | [Kestra 报告了翻译后占位符丢失](https://github.com/kestra-io/kestra/issues/17790)，[i18next 官方 CLI 已支持校验](https://github.com/i18next/i18next-cli) | 问题真实，已有开源工具覆盖常用工作流。 |
| 日历导出时区预检 | [缺少 VTIMEZONE 导致客户端处理不一致](https://github.com/spatie/calendar-links/issues/235) | 问题具体，需要用多个真实客户端验证后再决定做法。 |

[Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) 和 [srt-merger](https://github.com/machinewrapped/srt-merger) 已覆盖编辑和逐条对齐。这个原型先验证一个更窄的用途，即从两份导出的字幕中快速定位时间覆盖差异，再在原编辑器处理。以上证据说明问题存在，尚无独立用户对 CueProof 的反馈。

## 验证

```sh
npm run build
npm run check:build
npm test
```

测试使用原创样例和独立的逐毫秒核对模型。接下来的用户验证要记录第一次核对所用时间、用户找到的正确异常，以及哪些提示会让用户不必要地返工。

格式参考 [美国国会图书馆 SubRip 说明](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml) 和 [W3C WebVTT 规范](https://www.w3.org/TR/webvtt1/)。
