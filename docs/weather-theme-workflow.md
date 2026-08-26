# 全新天气主题：通用方案模板与落地流程

> 适用范围：需要同时替换首页 Hero、快捷记录图标、待办图标、底部导航图标和全局深浅色配色的完整主题。
>
> 不适用范围：只更换一张首页背景的轻量主题。轻量主题继续参考 [`hero-prompt-template.md`](./hero-prompt-template.md)。

## 1. 固定原则

- 不改变页面信息架构、业务流程和核心操作位置，只改变主题视觉与必要的装饰动态。
- 中文主题名优先使用 **4 个字**；英文印章简短、易辨认，不承担关键信息。
- 一套完整主题包含 **4 个时段 Hero、4 个快捷图标、6 个待办图标、5 个导航图标和 1 张缩略图**。
- 天气判断和天气覆盖层全主题共用，不为每个新主题重复制作七套天气图片。
- 图标使用同一画布，并以实际视觉面积校准；不得依赖某个主题专属 CSS 单独放大或缩小。
- 生图源文件和项目交付文件分开：图标优先直接生成透明 PNG 源文件，最终统一导出透明 WebP；Hero 和缩略图最终导出不透明 WebP。
- 浅色与深色模式只改变颜色、阴影和表面层级，不改变组件尺寸和页面结构。
- 业务状态色与核心“记录”橙保持原语义，不能为了主题感随意改色。
- 动态必须轻量、可关闭，并支持 `prefers-reduced-motion`。

## 2. 标准协作流程

### 阶段 A：方向提案

先提供 2～3 个差异足够大的方向，每个方向只需说明：

- 主题名
- 一句话概念
- 主体世界观
- 核心色彩
- 主要材质或画风
- 与已有主题的区别
- 主要取舍

必须明确推荐方案。用户选定方向后，再进入完整方案，不提前生成整套资源。

### 阶段 B：完整方案

按照本文第 3 节填写完整方案，重点确认：

- 四张 Hero 是否使用不同主体和构图
- 是否需要动态，以及动态落点
- 天气继续共用还是确有必要扩展
- 图标的统一语言和差异化配色
- 浅色、深色页面的整体色调
- 资源数量和实现成本

完整方案确认后才进入制作。

### 阶段 C：视觉制作

推荐顺序：

1. 先生成白天 Hero，验证题材、画风、右侧主体和左侧文字区。
2. 生成其余三个时段，确保是同一世界，但主体和镜头不重复。
3. 生成快捷图标，验证图标材质、描边、光源和透明背景。
4. 按同一规范生成待办和导航图标。
5. 统一裁切、缩放、透明边距、WebP 参数和文件命名。
6. 制作缩略图。

如果方向已经经过完整确认，样图没有明显偏离方案，可以连续制作，不必为每一张图重复确认。

### 阶段 D：代码接入

按本文第 8 节接入资源和主题变量。只改主题相关文件，避免顺手重构无关模块。

### 阶段 E：质量检查与提交

按本文第 9 节完成自动检查和浏览器视觉验收。通过后使用单一目的的中文 Commit 提交。

推荐提交信息：

```text
功能(主题): 新增{主题名}完整主题
```

## 3. 完整方案填写模板

复制以下内容，替换花括号中的字段。

```markdown
# {四字主题名}完整方案

## 主题定位

- 中文名称：{四字主题名}
- 英文印章：{SHORT STAMP}
- 内部主题 ID：hero-{slug}
- 视觉主题值：{slug}
- 一句话概念：{一句话说明主题世界}
- 风格关键词：{关键词 4～6 个}
- 主体材质：{材质或绘画媒介}
- 与已有主题的区别：{题材、构图、配色或材质差异}

## 配色

### 浅色模式

| 用途 | 色值 |
|---|---|
| 页面背景 | {#HEX} |
| 卡片背景 | {#HEX} |
| 次级背景 | {#HEX} |
| 主文字 | {#HEX} |
| 次文字 | {#HEX} |
| 品牌主色 | {#HEX} |
| 品牌深色 | {#HEX} |
| 辅助色 A | {#HEX} |
| 辅助色 B | {#HEX} |
| 少量对比色 | {#HEX} |

### 深色模式

| 用途 | 色值 |
|---|---|
| 页面背景 | {#HEX} |
| 卡片背景 | {#HEX} |
| 次级背景 | {#HEX} |
| 主文字 | {#HEX} |
| 次文字 | {#HEX} |
| 品牌主色 | {#HEX} |
| 品牌亮色 | {#HEX} |
| 辅助色 A | {#HEX} |
| 辅助色 B | {#HEX} |

## 四张 Hero

| 时段 | 不同主体 | 场景与构图 | 光线与配色 | 可选动态 |
|---|---|---|---|---|
| 清晨 | {主体} | {场景} | {光线} | {动态} |
| 白天 | {主体} | {场景} | {光线} | {动态} |
| 傍晚 | {主体} | {场景} | {光线} | {动态} |
| 夜晚 | {主体} | {场景} | {光线} | {动态} |

## 天气适配

- 共用现有天气逻辑：是
- 晴、多云、阴、雨、雾、雪、雷雨的承载区域：{天空、玻璃、屋檐、地面等}
- 主题专属调整：{仅透明度、混合模式或遮挡关系}
- 是否新增天气图片：否；如确有必要，说明原因和维护成本

## 图标系统

- 画风：{统一风格}
- 材质：{统一材质}
- 视角：{正面或 3/4 视角}
- 描边：{颜色和粗细}
- 光源：左上方
- 阴影：右下方短柔影
- 主体视觉体量：同类图标看起来接近，不按外框像素机械判断
- 配色规则：每枚图标 2～3 个主色，功能间略有区分

### 快捷图标

| 功能 | 主体 | 主色 | 辅色 |
|---|---|---|---|
| 喂奶 | {主体} | {颜色} | {颜色} |
| 排便 | {主体} | {颜色} | {颜色} |
| 护理 | {主体} | {颜色} | {颜色} |
| 其他 | {主体} | {颜色} | {颜色} |

### 待办图标

| 功能 | 主体 | 主色 | 辅色 |
|---|---|---|---|
| 用药 | {主体} | {颜色} | {颜色} |
| 抚触 | {主体} | {颜色} | {颜色} |
| 洗澡 | {主体} | {颜色} | {颜色} |
| 护理 | {主体} | {颜色} | {颜色} |
| 疫苗 | {主体} | {颜色} | {颜色} |
| 生长 | {主体} | {颜色} | {颜色} |

### 导航图标

| 功能 | 主体 | 主色 | 辅色 |
|---|---|---|---|
| 今日 | {主体} | {颜色} | {颜色} |
| 记录 | {主体} | {颜色} | {颜色} |
| AI | {主体} | {颜色} | {颜色} |
| 趋势 | {主体} | {颜色} | {颜色} |
| 档案 | {主体} | {颜色} | {颜色} |

## 页面级表现

- 首页：{Hero、快捷区和待办区表现}
- 记录：{时间线和记录图标表现}
- AI：{主题识别与对话可读性}
- 趋势：{主趋势、对照、提示和最新点颜色}
- 档案与设置：{装饰强度与信息密度}

## 资源和成本

- 基础资源：20 张
- 可选动态图片：{0～8 张；默认优先代码叠加层}
- 预计新增 CSS：1 个主题文件和少量 Hero 映射
- 不改动：业务结构、天气判断、核心记录动作

## 验收标准

- {列出该主题特有要求}
- 满足本文第 9 节通用验收项
```

## 4. Hero 通用规范

### 导出规格总表

| 资源 | 数量 | 生图或工作源 | 项目最终尺寸 | 项目最终格式 | 透明要求 | 建议导出参数 |
|---|---:|---|---|---|---|---|
| 四时段 Hero | 4 | 宽幅 PNG 或无损原图，尺寸不低于最终尺寸 | 1080 × 432 | WebP | 不透明 | `quality 82～88`，保留 sRGB |
| 快捷图标 | 4 | 1024 × 1024 或更大的透明 PNG | 256 × 256 | WebP | 真实 Alpha | `quality 88`、`alphaQuality 100` |
| 待办图标 | 6 | 1024 × 1024 或更大的透明 PNG | 256 × 256 | WebP | 真实 Alpha | `quality 88`、`alphaQuality 100` |
| 导航图标 | 5 | 1024 × 1024 或更大的透明 PNG | 256 × 256 | WebP | 真实 Alpha | `quality 88`、`alphaQuality 100` |
| 主题缩略图 | 1 | 从代表性 Hero 裁切或单独制作 | 540 × 216 | WebP | 不透明 | `quality 82～88`，比例 2.5:1 |
| 可选透明动态层 | 按需 | 透明 PNG 序列或无损源文件 | 按实际容器的 2× 像素尺寸制作 | 优先透明 WebP；兼容性需要时用 PNG | 真实 Alpha | 不包含天气效果，不使用 GIF |

说明：

- 表中尺寸是进入项目目录的最终像素尺寸，不是生图服务必须返回的原始尺寸。
- 图标必须先从高分辨率透明源图裁切和校准，再缩小到 256 × 256；不要直接以 256 × 256 作为生图源。
- WebP 必须保留 sRGB 和正确的 Alpha 通道，不保留无用 EXIF、ICC 或编辑器元数据。
- 同类资源使用同一批处理参数，避免单张图片因压缩率或锐化方式不同而显得突兀。

### 资源规格

- 时段固定为 `morning`、`daytime`、`evening`、`night`。
- 最终尺寸统一为 **1080 × 432**，比例 **2.5:1**。
- Hero 为不透明 WebP，建议 `quality 82～88`；不在图片内写中文、英文、Logo 或 UI。
- 左侧约 0%～46% 为低细节文字区，主体集中在右侧约 52%～90%。
- 主体必须处于手机端安全裁切范围，不能紧贴顶部、底部或最右边缘。

### 四张图的关系

四张图应当“同一世界、不同主体”，而不是同一张图换四种滤镜。

必须统一：

- 绘画媒介或渲染方式
- 材质语言
- 核心建筑、产品或世界观线索
- 描边、颗粒、光影逻辑

必须变化：

- 主体物件或主要空间
- 镜头角度
- 前中后景关系
- 时间对应的活动状态
- 光照和局部配色

### Hero 生图提示词骨架

```text
Use case: stylized-concept
Asset type: responsive web app Hero background, final crop 1080×432
Primary request: create the {time period} scene for the “{theme}” theme
Scene/backdrop: {scene}
Subject: {different principal subject}
Style/medium: {shared style and medium}
Composition/framing: very wide 2.5:1 landscape; keep left 46% calm and low-detail for white UI copy; place the principal subject in the right 52–90%; mobile-safe focal point
Lighting/mood: {time-specific lighting}
Color palette: {palette}
Materials/textures: {shared materials}
Weather compatibility: leave readable areas of sky, glass, roof/awning and ground for generic weather overlays
Constraints: no people or animals unless explicitly approved; no logo, no legible words, no UI, no watermark, no border; do not repeat another time period’s composition
```

## 5. 通用天气规则

当前天气表现由共享逻辑和覆盖层提供：

- 晴：光线或日光增强
- 多云：云影和柔光
- 阴：降低饱和度和亮度
- 雨：雨滴、雨线和环境反光
- 雾：远景柔化和雾层
- 雪：飘雪与浅色覆盖
- 雷雨：雨层和远处闪光

新增主题默认只做以下适配：

- Hero 本身为天气层预留承载区域。
- 调整主题下天气层的透明度、混合模式或遮挡关系。
- 避免阴雨天气把主题整体染成不符合方向的冷色。
- 装饰动态不能压过雨、雪、雾和雷电反馈。

只有共享天气系统无法表达关键主题语义时，才讨论新增天气资源；这属于范围扩大，需要重新确认。

## 6. 图标通用规范

### 资源与命名

所有图标的生图源优先使用 **1024 × 1024 或更大的透明 PNG**，项目最终文件统一导出为 **256 × 256 透明 WebP**，建议 `quality 88`、`alphaQuality 100`。

```text
public/hero/weather/{slug}/
├── backgrounds/
│   ├── morning.webp
│   ├── daytime.webp
│   ├── evening.webp
│   └── night.webp
├── stickers/
│   ├── sticker-feeding.webp
│   ├── sticker-bowel.webp
│   ├── sticker-care.webp
│   └── sticker-note.webp
├── icons/
│   ├── tasks/
│   │   ├── medicine.webp
│   │   ├── massage.webp
│   │   ├── bath.webp
│   │   ├── care.webp
│   │   ├── vaccine.webp
│   │   └── growth.webp
│   └── nav/
│       ├── today.webp
│       ├── records.webp
│       ├── chat.webp
│       ├── trends.webp
│       └── archive.webp
└── thumb.webp
```

### 视觉体量校准

- 先裁掉透明空边，再放回统一 256 × 256 透明画布。
- 常规主体边界约占画布的 70%～80%。
- 细长或内部留白多的主体适当放大；宽扁或实体面积大的主体适当收紧。
- 可以使用透明像素面积作为第一轮数据参考，但不能代替实际视觉判断。
- 快捷区、待办卡片、时间线和导航栏必须分别预览。
- 同一套图标建议把视觉面积差控制在约 10% 内。
- 若某个图标显得偏大或偏小，应直接调整图片主体，而不是增加主题专属 CSS 缩放。

### 透明图生成与校验

图标可以并且应当在生图阶段直接要求真实透明背景。提示词必须同时写明：

- `genuinely transparent background`
- `RGBA output with real alpha`
- `no checkerboard, no solid backdrop`
- 主体阴影只能是紧贴主体的 contained shadow，画布其余区域完全透明

生成后不能只看预览，必须读取文件元数据和 Alpha 像素进行验证：

1. 源文件应为 RGBA，存在真实 Alpha 通道。
2. 画布四角必须为完全透明像素。
3. 在浅色、深色和高对比纯色底上分别合成预览，检查白边、黑边、棋盘格、游离像素和主体缺口。
4. 先清理游离小连通区域，再按主体真实边界裁切；不能让远处的残留像素参与尺寸计算。
5. 最终 256 × 256 WebP 再次检查 Alpha、主体边界、视觉重心和小尺寸辨识度。

如果生图结果把棋盘格、白底或黑底直接画进文件：

1. 优先重新执行背景提取，明确要求保留主体并输出真实 Alpha。
2. 若仍无法得到真实透明图，改为生成主体不包含的单一高饱和色背景，再使用色键转换为 Alpha。
3. 不建议对白色、灰色或棋盘格背景直接做宽松亮度阈值抠图；当主体含珍珠白、浅色高光或柔影时，容易造成缺口和破损。
4. 任何兜底抠图都必须重新完成三种背景检查，不得直接进入项目。

### 图标生图提示词骨架

```text
Use case: stylized-concept
Asset type: square app icon on a genuinely transparent background
Primary request: create one {function} icon for the “{theme}” theme
Subject: exactly {object or compact object group}
Style/medium: {shared icon style}; clean compact silhouette; consistent 3/4 viewpoint
Composition/framing: centered; optical visual mass about 72% of a square canvas; balanced transparent padding; calibrate narrow or hollow objects larger and solid wide objects smaller
Lighting/mood: soft upper-left light; short contained lower-right shadow
Color palette: {2–3 function colors}
Outline: {shared outline color and weight}
Constraints: genuinely transparent background and alpha; no colored square, badge, border, text, letters, numbers, logo, watermark or photorealism; exactly the described object
Output requirement: transparent PNG source, RGBA with real alpha; no checkerboard baked into pixels
```

## 7. 动态通用规范

默认使用 Hero 内的轻量代码叠加层，不为每个细节制作整张 GIF 或视频。

- 每个时段最多 2～3 个动态点。
- 周期建议 5～10 秒。
- 位移建议 2～6px。
- 光照透明度变化建议 8%～15%。
- 不使用快速闪烁、大幅缩放、持续弹跳或整张画面漂浮。
- 同一时刻只保留一个主要动态，其余作为次级环境反馈。
- 开启 `prefers-reduced-motion` 时停止动画并保留完整静态画面。
- 若需要透明动态图片，按时段单独放在 `motion/`，不得把天气效果烘焙进去。

适合动态的对象：

- 蒸汽、薄雾、光斑
- 布料边缘、门牌、窗帘
- 灯光呼吸、玻璃高光
- 星点、微粒、远处小范围环境运动

## 8. 代码接入清单

基础接入通常涉及：

1. `src/config/weatherThemes.ts`
   - 扩展 `WeatherHeroThemeId`
   - 添加 `thumb`、`stickers`、`tasks`、`nav` 映射
2. `src/views/settings/AppearanceCard.tsx`
   - 添加四字主题名称和缩略图
3. `src/App.tsx`
   - 将 `hero-{slug}` 映射为 `data-visual-theme="{slug}"`
4. `src/main.tsx`
   - 引入 `theme-{slug}.css`
5. `src/styles/layout.css`
   - 添加四个时段背景路径
   - 添加 Hero 左侧渐变、状态条背景和英文印章
6. `src/styles/theme-{slug}.css`
   - 定义浅色、深色 token
   - 定义页面表面、交互状态和可选动态
7. `src/DiaryHero.tsx`
   - 优先复用现有天气与动态容器；只有通用容器无法承载时才修改

不要为单个主题复制天气判断逻辑，也不要在业务组件内散落十几处主题条件。

## 9. 验收清单

### 资源检查

- [ ] 4 张 Hero 文件齐全，尺寸均为 1080 × 432。
- [ ] 4 张快捷、6 张待办、5 张导航图标齐全。
- [ ] 所有图标拥有真实透明通道，没有黑底或白边。
- [ ] 所有图标源文件经过 Alpha 元数据检查，四角为全透明，不是烘焙棋盘格。
- [ ] 所有图标已在浅色、深色和高对比纯色背景上检查，无游离像素、主体缺口或边缘色溢出。
- [ ] 项目内图标均为 256 × 256 透明 WebP；Hero 均为 1080 × 432 不透明 WebP；缩略图为 540 × 216 不透明 WebP。
- [ ] `thumb.webp` 能在主题列表中快速辨认主题。
- [ ] 文件命名、目录和配置路径完全一致。

### 视觉检查

- [ ] 四张 Hero 主体和构图不同，但明显属于同一主题。
- [ ] Hero 左侧文字在浅色、复杂和夜间背景上均清晰。
- [ ] 手机端裁切不丢失核心主体。
- [ ] 快捷、待办和导航图标分别看起来差不多大。
- [ ] 图标颜色略有区分，但材质、描边、视角、光源和阴影统一。
- [ ] “今日待办”文字颜色遵守全主题统一规则。
- [ ] 浅色和深色模式均无明显冷暖偏色、低对比或刺眼表面。
- [ ] 选中、悬停、按下、禁用和焦点状态仍可辨认。

### 天气与动态检查

- [ ] 晴、多云、阴、雨、雾、雪、雷雨可以正常切换。
- [ ] 雨、雪、雾不会完全遮住 Hero 主体和文字。
- [ ] 动态不会与天气反馈争夺注意力。
- [ ] `prefers-reduced-motion` 下动画停止。
- [ ] 关闭天气遮罩后，Hero 仍是完整画面。

### 响应式与运行检查

- [ ] 桌面端首页检查。
- [ ] 390 × 844 手机视口检查。
- [ ] 主题设置中的四时段预览检查。
- [ ] 浏览器控制台无资源 404 和运行错误。
- [ ] `npm run check:css` 通过。
- [ ] `npm test -- --run` 通过。
- [ ] `npm run build` 通过。
- [ ] `git diff --check` 通过。

## 10. 完成定义

只有同时满足以下条件，才算一个完整主题完成：

- 方案经过确认。
- 20 张基础资源全部进入项目目录。
- 四时段、天气、深浅色和配套图标全部接入。
- 图标经过真实界面视觉体量校准，而不只是统一像素尺寸。
- 桌面端和手机端均完成视觉检查。
- 自动测试和生产构建通过。
- 工作区只包含本主题相关改动。
- 已使用中文、单一目的 Commit 提交。
