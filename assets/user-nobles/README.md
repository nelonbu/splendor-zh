# 自备贵族图片记录

正式游戏现使用 `public/custom-nobles/N-06.webp` 和 `N-07.webp`。原始 PNG 已在压缩版接入后按用户要求删除；旧文件路径、大小和 SHA-256 保留在 `assets/pygem-manifest.json` 的 `original` 字段中。

图片仅作背景展示。分数、宝石要求和贵族 ID 仍来自主项目数据。今后替换图片时，保持对应的 WebP 文件名，并同步更新清单中的大小、SHA-256；`npm run assets:check` 会核对正式文件和映射。
