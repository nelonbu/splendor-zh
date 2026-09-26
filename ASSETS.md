# PyGem 素材与数据审计

## 发布授权更新（2026-09-26）

用户已确认原项目代码及本项目使用的图片、图标、字体均已获得 GitHub 发布所需授权。下方阶段记录中关于“仅本地运行”及“公开发布授权待确认”的表述保留为当时的审计历史，不再代表当前授权状态。此处记录用户确认，不替代具体授权文件或许可条款。

## 当前独立项目状态（2026-09-26）

正式游戏只读取项目内的 `public/pygem/` 与 `public/custom-nobles/` 图片，映射位于 `src/components/gameArt.generated.ts`。原阶段 1 清单已保存为 `assets/pygem-manifest.json`，其中的 `../PyGem-main` 是历史来源记录，不是运行或校验依赖。`npm run assets:check` 现在直接校验正式图片的 SHA-256、路径大小写及映射覆盖；`npm run assets:preview` 和 `npm run assets:sample` 也只读取项目内文件。相邻参考目录与 `dev-assets/pygem/` 导入副本已移除。下文保留原审计过程记录，其旧命令和路径仅代表当时的状态。

## WebP 正式素材（2026-09-26）

用户提供的 43 张 PyGem 背景和 2 张自备贵族图片已采用无 `_结果` 后缀的 WebP 文件名。原 PNG 与不再使用的 `public/sample-art/` 副本已删除；项目原有的小型 `public/cards.png`、`public/gems.png` 和 README 截图 `demo.png` 不属于本次转换范围。45 张正式 WebP 共约 3.68 MiB，对应 PNG 原图约 60.10 MiB。清单中每个转换条目保存当前 WebP 路径、大小、SHA-256，以及旧 PNG 的 `original` 来源记录。`npm run assets:sample` 现在核对代表素材，不再制作重复副本。宝石 SVG 保持原格式。正式映射仍只作展示，不影响规则数字或 ID。


参考目录：`../PyGem-main`，只读。阶段 1 将素材副本导入 `dev-assets/pygem/`；阶段 3 已把固定映射接入所有相关游戏界面。主项目原有 `public/cards.png` 和 `public/gems.png` 仍仅用于规则说明弹窗。

## 阶段 3：正式游戏素材覆盖

`npm run assets:game` 从阶段 1 审计清单读取固定路径，校验源 SHA-256 后，将 49 个 PyGem 图片/图标副本复制到 `public/pygem/`，并将 `N-06.PNG`、`N-07.PNG` 两张用户补图复制到 `public/custom-nobles/`；字体不属于本阶段。脚本生成 `src/components/gameArt.generated.ts`，明确列出主项目 90 张卡、10 位贵族、3 种牌背、6 种宝石到图片路径的映射。已有文件内容不同会报错，不会静默覆盖。`npm run assets:game:check` 逐文件验证哈希与路径大小写、生成文件一致性和映射覆盖。

覆盖结果：发展卡 **14 精确匹配、76 固定装饰分配、0 待处理**；贵族 **8 精确匹配、2 用户补图、0 待处理**；宝石 6/6、牌背 3/3。图片只作展示背景，分数、加成、费用及贵族要求继续由主项目数据绘制。固定装饰分配不表示参考游戏的数值相同。失败图片会从 DOM 移除，保留底色与数字文字。从牌背盲预留时，飞行层只显示对应等级的牌背，牌正面不会在动画中提前出现。阶段 2 曾保留 `public/sample-art/` 副本，现已删除。

本阶段在 `dist/` 逐一核对了映射实际引用的 **47 个不同 URL**：构建文件均存在且哈希与 `public/` 相同，Vite 生产预览返回 HTTP 200 与正确的 PNG/SVG MIME。51 个导入文件多于 47 个 URL，是因为多个主项目对象共用装饰背景，另有少数已导入背景当前未被映射引用。素材仅获用户授权用于本地运行，公开发布仍须另核使用权。

## 阶段 2：正式界面的小范围展示素材（历史记录）

阶段 2 运行 `npm run assets:sample` 曾按阶段 1 清单校验并复制四个代表性文件：`1-U-01` → `blue1-1.png`（精确匹配）、`1-W-08` → `white1-2.png`（固定装饰分配）、`N-06` → 用户补图 `N-06.PNG`、蓝色宝石 → `sapphire-octagon-inline.svg`。当时其他牌仍显示原有纯色牌面；阶段 3 的当前覆盖状态见上节。源文件版本与哈希见 `dev-assets/pygem/manifest.json`。

通过 `npm run dev:local -- --host 127.0.0.1` 启动后打开 `/tools/playable-sample.html`，可在确定性夹具中直接购买蓝卡或预留白卡。该 HTML 仅供 Vite 开发预览，不在生产构建中，正式初始资源保持原状。用户已确认素材仅用于本地运行交付；公开发布授权仍未核验。

## 自备贵族补图（历史记录）

用户已在 `assets/user-nobles/` 放入 `N-06.PNG` 和 `N-07.PNG`。两张源图保持原名、原尺寸和原字节，未复制到 PyGem 目录；阶段 2 另将 `N-06.PNG` 的校验副本放入正式构建：

| 主项目 ID | 文件 | 尺寸 | 大小 | SHA-256 |
|---|---|---:|---:|---|
| `N-06` | `assets/user-nobles/N-06.PNG` | 849×849 | 679,827 B | `cef8e0af87c7d632b7d5221527b0c76a087c3336adcd1ee9ba1ac8675d6027bc` |
| `N-07` | `assets/user-nobles/N-07.PNG` | 900×900 | 1,045,460 B | `47810c99cdaf8bdededcb8a49ce3e0524fcfddbae097c4d1ee4b2a60c94bede7` |

开发清单将它们标为 `user-supplied`，直接引用实际大写 `.PNG` 路径；贵族映射现在是 **8 个 PyGem 要求精确匹配、2 个自备补图、0 个待处理**。图片只影响展示，不改变 `N-06`、`N-07` 的要求。开发预览服务可展示两张原图与对应 ID；阶段 2 曾仅接入 `N-06`，阶段 3 已将两张图都接入正式游戏。若原文件内容变化，`npm run assets:check` 会因哈希变化而失败，重新执行阶段 1 导入需显式 `--update` 更新生成清单。

## 阶段 1：可复现导入与映射

- `npm run assets:import` 静态解析 `../PyGem-main/cards.py`、`gui_cards.py` 和主项目 `src/game/constants.ts`，复制 50 个文件（43 PNG、6 SVG、1 TTF），生成 `dev-assets/pygem/manifest.json`。无需启动 PyGem 或安装 Flet。重复运行会跳过相同文件；发现已有导入文件与来源不一致时默认报错，只有明确使用 `node scripts/pygem-assets.mjs import --update` 才覆盖生成副本。
- `npm run assets:check` 重新从源码生成期望清单，核对全部导入文件的 SHA-256、映射路径和主项目 90 张卡牌、10 位贵族的 ID 分类覆盖。待处理项是显式状态，不伪装为精确匹配。
- `npm run assets:preview` 在终端打印一个空闲的本机地址，提供开发预览页，可筛选精确匹配、固定装饰分配、自备补图和待处理项，并浏览现有 52 个素材文件。预览页与导入副本都不进入 Vite 正式构建；已检查 `dist/pygem` 不存在。

以下为自备图片加入前的阶段 1 统计；当前贵族状态以本文件顶部的补图记录为准。

| 目标 | 精确匹配 | 固定装饰分配 | 待处理 |
|---|---:|---:|---:|
| 90 张发展卡 | 14 | 76 | 0 |
| 10 位贵族 | 8 | 0 | 2（`N-06`、`N-07`） |

发展卡先统一 PyGem 的 `w/b/g/r/n` 与主项目 `white/blue/green/red/black`，再按等级、分数、加成颜色和五色费用进行一对一比较。精确匹配使用 PyGem 对应的背景编号。其余 76 张按主项目 ID 的稳定 SHA-256 奇偶值在同颜色、同等级的两张纯装饰背景间固定分配；映射结果已逐 ID 写入清单，**不代表卡牌数值相同**。贵族只按统一后的五色要求精确匹配；`N-06`、`N-07` 保留空图片路径，等待人工选图。主项目规则数据没有变化。

`cards.py` 二级卡字典键 `w0b0g0r0n5` 在第 65 和 71 行重复；静态解析按 Python 字典语义保留后一个值，因此有效卡数为 40/28/20。完整重复键位置、每个素材大小与 SHA-256、源文件哈希均记录在 `manifest.json`。本地目录没有 Git 元数据，无法给出可信提交版本；`manifest.json` 自身本次 SHA-256 为 `966f066577c03a98d54622707015d697eeabdd21940267e40629b0b3d2369f30`。

图片内容检查：抽看了一级卡背景 `blue1-1.png`、三级卡背景 `red3-2.png`、贵族背景 `white-noble-1.png`、牌堆背景 `level-2-deck.png`，样本中未见费用、分数或文字。`gui_cards.py` 静态代码显示卡牌和贵族的费用圆标、分数以及牌堆等级文字由界面控件叠加在背景图之上；6 个 SVG 均无 `<text>`、`<tspan>` 或 `<foreignObject>` 标签。**未对全部 43 张 PNG 做逐张人工或 OCR 检查**，因此不把“全部图片绝无文字”作为已证实结论。导入素材字节总量 61,818,220；尺寸和分类见下表。

本地目录仍未发现 LICENSE、COPYING 或 NOTICE。用户已确认这些图片、图标和字体用于其**仅本地运行**的游戏交付；若将来公开发布，需要按新的使用范围重新核对来源与使用权。

`N-06`、`N-07` 的自备图片目录为 `assets/user-nobles/`，文件名和建议规格见该目录的 `README.md`。本段是补图前的阶段 1 记录；当前映射状态见本文件顶部“自备贵族补图”。

## 阶段 0 初查记录（保留）

## 素材清单

| 路径 | 内容 | 数量与规格 |
|---|---|---|
| `assets/images/*1-*.png` 等 | 发展卡背景 | 30 张；按 5 种加成颜色 × 3 个等级 × 2 个背景编号分类，非 90 张独立卡图。11 张为 816×1456，19 张为 960×1200 |
| `assets/images/*-noble-*.png` | 贵族背景 | 10 张，均为 1024×1024 |
| `assets/images/level-*-deck.png` | 三级牌堆背面 | 3 张，均为 960×1200 |
| `assets/icons/*.svg` | 五色宝石与金币图标 | 6 个 |
| `assets/fonts/Lobster-Regular.ttf` | 英文字体 | 1 个；简体中文覆盖范围未验证 |

43 张 PNG 总大小约 61.3 MB（十进制）；接入前需要评估浏览器加载体积。未在两个本地目录发现 LICENSE、COPYING 或 NOTICE 文件，图片及字体的再使用许可需要确认。

## 数据与映射差异

主项目 `src/game/constants.ts` 有 90 张发展卡（40/30/20）和 10 个贵族；卡牌有稳定的 `id`。PyGem `cards.py` 的字典字面量分别有 40/29/20 条，二级卡中费用键 `w0b0g0r0n5` 重复，Python 字典实际保留 40/28/20，共 88 张。该现象只作为参考项目数据差异记录，不在本项目内修复或移植。

按“等级、分数、加成颜色、五色费用”的多重集合比较，两个项目完全一致的发展卡共有 14 张：一级 9、二级 2、三级 3。贵族要求按五色数量比较有 8 个一致；主项目 `N-06`、`N-07` 无完全相同的 PyGem 贵族要求。不能用费用、图片文件名或中文名称作为游戏逻辑键，也不能把 PyGem 数据覆盖到主项目。

PyGem 的发展卡背景由 `gui_cards.py` 根据颜色、等级和 `bg_num` 选择；贵族背景由费用字符串映射到文件名。后续可建立独立的 **主项目 ID → 展示素材路径** 映射，未匹配卡牌和贵族需明确人工选择或通用背景回退。映射只影响显示；规则仍读取主项目原始卡牌和贵族数据。

## 当前显示入口

- `src/components/Card.tsx`、`NobleRow.tsx`、`GemPool.tsx`、`CardTiers.tsx`、`PlayerPanel.tsx` 是卡牌、贵族、宝石、牌堆及玩家持有区的主要呈现点。
- `src/components/AnimationProvider.tsx` 使用 Framer Motion 实现宝石和卡牌飞行动画；`NobleRow.tsx` 另有贵族退出动画。接入图片时需检查原有定位与尺寸。
- 可见文案散落在 `src/components/` 与 `src/App.tsx`，未发现集中汉化字典；`src/components/GemPool.tsx` 的颜色显示名称函数可作为现状参考，但不得转作规则判断。
