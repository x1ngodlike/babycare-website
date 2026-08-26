# Hero 背景图生图提示词模版（babycare 首页）

> 用途：用 ImageGen（文字转图片）批量生成经典轻量首页 Hero 背景，统一为 **1080×432（2.5:1）**，无透明通道，左侧叠白色文字（深色渐变遮罩），主体偏右。
> 本模版覆盖 12 套经典主题 × 5 个时段。需要 Hero、通用天气、整套图标、深浅色和动态一起落地时，请使用 [`weather-theme-workflow.md`](./weather-theme-workflow.md)。

---

## 0. 全局硬性约束（每张图都必须包含）

- **比例 / 尺寸**：宽幅全景 `2.5:1`（1080×432 或更高分辨率同比例，如 2160×864）。
- **主体位置**：核心元素（人物 / 标志物）放在**右侧 50%–85% 区域**；**左侧 0%–40% 保持大片留白或浅色/纯色**，方便 CSS 左侧深色渐变 + 白字可读。
- **禁止文字**：画面内不要出现任何文字、Logo、UI、水印——文字由页面前端叠加。
- **风格统一**：同一主题内 5 张时段图要保持一致的笔触、配色、主体，仅改变光照与天空。
- **避免高对比噪点**：边缘、左侧留白区尽量干净，避免复杂细节被 `cover` 裁切后影响观感。

---

## 1. 主题风格块（选 1 个，作为风格前缀）

| 主题 | 中文名 | 风格描述（写入提示词） |
|---|---|---|
| default | 绿野晨光 | 扁平卡通自然风，柔和绿色渐变天空，清新治愈，嫩芽与微云点缀，温暖明亮，低饱和马卡龙色，干净儿童插画 |
| paper | 折纸童趣 | 立体折纸 / 纸艺风格，几何折面与纸纹质感，纸鹤、纸树、纸太阳/月亮，手工剪纸拼贴感，明亮活泼 |
| watercolor | 手绘水彩 | 手绘水彩晕染，通透柔边，水痕与笔触可见，母与婴轮廓柔和，蝴蝶与花草，梦幻轻盈 |
| clay | 软陶时光 | 软陶 / 黏土质感，圆润立体造型，哑光表面，怀抱婴儿的可爱玩偶，草地与小蝴蝶，温暖奶油色调 |
| ink | 水墨丹青 | 中国风水墨，泼墨留白，墨色层次，古风人物与花鸟，远山淡墨，意境悠远，少量设色 |
| pixel | 像素萌兔 | 像素艺术 / 8-bit 风格，方块的明快色块，圆润像素小兔子，像素树林草地，日月星空用方形像素表现 |
| forest | 林间甜梦 | 水彩风森林清晨，熟睡婴儿卧于柔软垫褥，右侧大树与花草，左侧天空/雾气大面积留白，静谧治愈，柔和自然光 |
| cloud | 云端甜梦 | 3D 柔光卡通 / 微黏土质感，蓬松云朵与奶瓶、奶嘴、婴儿鞋等婴儿元素漂浮于右侧，左侧大面积渐变天空留白，梦幻马卡龙色，温馨治愈 |
| cozy | 暖房甜梦 | 温馨室内窗边场景，柔和自然光从右侧窗户洒入，毛线襁褓中露出可爱小熊玩偶，旁边摆放奶瓶与卷起的毛巾，左侧墙面大面积留白，奶油暖色调，治愈静谧 |
| pony | 星梦小马 | 毛绒玩具风，柔软蓬松的白色小马玩偶坐在星星毛绒毯上，旁边有微笑月亮抱枕、奶瓶与星星装饰，右侧主体集中，左侧天空渐变留白，奶油暖色调，梦幻治愈 |
| cyber | 赛博小马 | 3D 柔光科幻风，白色机械独角兽玩偶立于圆形窗前，窗玻璃外是霓虹城市天际线与光轨，旁边有微型行星仪与玻璃瓶，蓝紫粉霓虹光晕，右侧主体集中，左侧墙面大面积留白，未来感与童趣并存 |
| tale | 童话小马 | 毛毡 / 黏土质感童话场景，圆润蓬松的白色独角兽玩偶坐在蘑菇屋前的小草地上，周围有红色波点蘑菇、发光萤火虫与野花，右侧小木屋透出暖黄灯光，左侧云雾山谷大面积留白，奶油暖色调，梦幻治愈 |

---

## 2. 时段光照块（选 1 个，作为风格后缀）

| 时段 | 关键词（英文优先，混中文无所谓） | 画面要点 |
|---|---|---|
| morning | `morning light, soft sunrise, warm golden hour, gentle rays` | 晨光、暖金、薄雾、清新 |
| midday | `midday, bright noon, clear sky, vivid colors, high key` | 正午强光、蓝天、饱和、明亮 |
| afternoon | `afternoon, warm sunlight, soft shadows, cozy` | 午后暖阳、柔和阴影、慵懒 |
| evening | `sunset, golden orange sky, long warm light, dusk` | 黄昏橙粉、长影、温柔 |
| night | `night, starry sky, moonlight, deep blue, soft glow` | 深蓝夜空、月光、星点、静谧 |

---

## 3. 通用负向提示（Negative Prompt）

```
text, words, letters, logo, watermark, UI, button, frame, border,
heavy vignette, dark left side, clutter on left, low resolution,
blurry, distorted, extra limbs, deformed baby, messy
```

---

## 4. 拼装公式

```
[主题风格块] + [主体描述] + [时段光照块] + "wide panoramic 2.5:1 composition, key subject on right side, clean empty left area for text overlay, no text" + [负向提示]
```

### 主体描述（按需替换，保持右侧）
- 通用亲子：`a gentle parent holding a smiling baby, soft and warm`
- 自然：`sprout, soft clouds, gentle hills`
- 萌物：`a cute pixel rabbit, round and friendly`

---

## 5. 直接可用的示例（default 主题 · 全套）

- **morning**：扁平卡通自然风，柔和绿色渐变天空，清新治愈，嫩芽与微云点缀，温暖明亮；a gentle parent holding a smiling baby on the right; morning light, soft sunrise, warm golden hour; wide panoramic 2.5:1 composition, key subject on right side, clean empty left area for text overlay, no text
- **midday**：扁平卡通自然风……（同风格前缀）; midday, bright noon, clear sky, vivid colors; wide panoramic 2.5:1……left area for text, no text
- **afternoon**：……afternoon, warm sunlight, soft shadows, cozy; ……
- **evening**：……sunset, golden orange sky, long warm light, dusk; ……
- **night**：……night, starry sky, moonlight, deep blue, soft glow; ……

> 其他主题把「扁平卡通自然风……」整段换成第 1 节对应主题描述，把「a gentle parent holding a smiling baby」按需要换成该主题主体即可。

---

## 6. 生成后处理提醒

- 导出后按之前流程转 WebP：`RGBA→RGB 白底，quality=88`，放入 `public/hero/{theme}/{period}.webp`。
- 桌面端 `cover` 会上下裁切约 45%–57%，生成时**主体尽量居中偏右且垂直居中**，避免关键元素贴顶/贴底。
- 若 ImageGen 不支持精确 2.5:1，生成后可裁切到 1080×432，或生成更高分辨率同比例再缩放。
