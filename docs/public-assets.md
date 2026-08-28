# Public 图片资源规范

> 本文是 `public` 图片的目录、命名、导出和自动校验事实来源。主题的设计与生图流程见 [`theme-design-and-delivery.md`](./theme-design-and-delivery.md)。

## 1. 目录职责

```text
public/
├── app-icons/                         # PWA 安装图标，仅 PNG
├── images/                            # 跨主题通用图片
│   ├── avatars/
│   │   └── roles/
│   ├── icons/{quick,tasks,nav}/
│   ├── illustrations/
│   └── milestones/
├── hero/
│   ├── classic/{preset}/           # 经典背景，每套五时段
│   └── weather/
│       ├── shared/overlays/        # 所有完整主题共用天气层
│       └── {theme}/                # 完整主题资源包
│           ├── backgrounds/
│           │   ├── default/
│           │   └── {variant}/  # 可选推荐背景
│           ├── icons/{quick,tasks,nav}/
│           └── thumbnails/
└── manifest.webmanifest
```

`public` 根目录只允许上述四个入口。禁止放入 `.DS_Store`、备份、联系表、生图源文件、临时脚本或其他未归类内容。

## 2. 命名与规格

- 目录与文件名使用小写 `kebab-case`；业务已存在的里程碑文件名可保留。
- PWA 图标使用 PNG：`app-icons/icon-192.png` 与 `app-icons/icon-512.png`。
- 其他入库图片统一 WebP；主题图标与通用图标为 256 × 256 且保留真实 Alpha。
- 完整主题 Hero 为 1080 × 432，四时段名固定为 `morning` / `daytime` / `evening` / `night`。
- 完整主题缩略图为 540 × 216；主题入口用 `thumbnails/theme.webp`，推荐背景名与 `backgrounds/{variant}` 一一对应。
- 经典 Hero 保留五时段命名：`morning` / `midday` / `afternoon` / `evening` / `night`。

## 3. 新增和替换

1. 按资源职责放入唯一目录，不在旧路径留兼容副本。
2. 修改配置或样式中的绝对 URL；不用 CSS 补丁修正单枚图标的尺寸或重心。
3. 运行 `npm run assets:check`，检查根目录、数量、命名、尺寸、格式、Alpha 和代码引用。
4. 运行与改动范围对应的代码检查；`npm run build` 已内置资源校验。

如果新增完整主题，必须同时交付 4 张默认 Hero、15 枚图标和 1 张主题缩略图。新增推荐背景时，每套增加 4 张 Hero 和 1 张同名缩略图，不复制图标。

使用系统 Emoji / 线性图标的代码原生轻量主题可在 `scripts/check-assets.mjs` 的明确白名单中登记为背景包，只包含 4 张 Hero 与 1 张缩略图；不得把普通图片主题借此拆成不完整资源包。

## 4. 备份、优化与缓存

- 备份不得位于 `public`。`npm run images:optimize` 只优化 `public/images/**/*.webp`，写入前备份到项目根目录 `.image-backups/{timestamp}/`。
- Hero 和 PWA 图标有固定构图与尺寸，不进入通用批量优化。
- `scripts/build-sw.mjs` 递归预缓存 `app-icons`、`images` 和 `hero`，并用文件内容生成缓存版本。
- 替换同名资源后必须执行完整 `npm run build`，不能只部署单张图片或复用旧 `sw.js`。

## 5. 自动校验边界

`npm run assets:check` 检查可由机器确定的资源问题，不判断构图、色彩、边缘观感、主体破损、视觉体量或重心。这些视觉项由用户验收。
