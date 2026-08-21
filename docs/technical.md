# 宝宝照护记录：技术文档

> 本文以当前代码为准，描述架构、数据、接口和运维约定。文档导航见 [README.md](./README.md)，产品规则见 [product.md](./product.md)，UI 规范见 [ui-guidelines.md](./ui-guidelines.md)。

## 1. 技术概览

### 1.1 技术栈

版本以 `package.json` 为准。

| 层级 | 技术 | 用途 |
|---|---|---|
| 前端 | React、TypeScript、Vite | 单页应用、类型检查和构建 |
| 后端 | Node.js、Express、TypeScript | REST API、SSE、静态资源服务 |
| 数据 | better-sqlite3、SQLite WAL | 业务数据和配置持久化 |
| 校验 | Zod | API 输入和备份结构校验 |
| 图片 | Multer、Sharp | 头像接收、压缩和 WebP 输出 |
| 外部请求 | Axios | AI 和 PushPlus 请求 |
| 测试 | Vitest | 前后端单元测试 |
| Android | Java、WebView、Gradle | 内部 App 原生壳与服务器环境切换 |

### 1.2 架构

```text
浏览器 / Android WebView
        │
        ▼
React SPA
  ├─ REST API ───────────────┐
  ├─ EventSource /api/events │
  ├─ localStorage 缓存/队列  │
  └─ Service Worker 静态缓存  │
                              ▼
Express
  ├─ 会话与权限
  ├─ 业务校验
  ├─ SSE 变更广播
  ├─ AI 日报与 PushPlus 调度
  ├─ 头像与备份
  └─ better-sqlite3 → baby-care.db
```

实时通道是 Server-Sent Events，不是 WebSocket。客户端在 SSE 未连接时每 30 秒刷新一次；页面恢复可见时也会刷新。

## 2. 代码结构

```text
src/
  App.tsx                应用主组件：会话、数据加载、实时刷新、离线同步与页面切换
  views/                 Today / History / RecordEditor / RecordDialogs / Settings / Trends / Archive / Chat 视图
  views/settings/        设置页按功能拆分的卡片（Profile / Ai / Backup / CareItems / Family / Vaccine / Push / NativeNotifications / Appearance）
  VaccineViews.tsx       疫苗视图与编辑器
  vaccines.ts            疫苗计划的前端适配
  careSchedule.ts        照护周期的前端适配
  usePullToRefresh.ts    移动端下拉刷新 Hook
  date.ts                客户端日期与年龄工具
  api.ts                 REST API 封装
  offline.ts             本地缓存和离线写队列
  DateField.tsx          日期/时间选择器
  ui.tsx / ui.css        通用组件
  styles/                foundations / base / layout / light / hero-records / dark / charts / chat / milestone / components（按 import 顺序保持覆盖语义）

server/
  index.ts               Express 入口：中间件、鉴权顺序、静态服务、错误处理与启动
  routes/                auth / system / profile / family / ai / growth / vaccines / milestones / records / push 路由分组
  routes/context.ts      路由模块共享的运行时依赖类型
  schemas.ts             API 输入与备份结构校验（zod）
  normalize.ts           请求载荷到业务实体的归一化
  avatar-dir.ts          头像目录初始化与路径诊断
  export-payload.ts      完整备份导出载荷组装
  db/                    connection（连接与迁移）+ 按领域拆分的数据访问（records / growth / vaccines / milestones / care-items / family / profile / ai / push / chat / daily-reports / backup / errors）
  auth.ts                家庭身份会话与权限中间件
  events.ts              SSE 连接与广播
  shanghai-date.ts       Asia/Shanghai 日期边界
  daily-report.ts        昨日报告汇总和调度
  ai.ts                  AI 请求与基础报告逻辑
  push.ts                PushPlus 调度与发送
  push-templates.ts      推送内容模板与数据构建
  vaccine-plan.ts        疫苗计划的服务端适配
  backup.ts              JSON 服务器备份（保留 30 份、手动/自动类型、删除）
  types.ts               服务端类型

shared/
  date.ts                跨端日期字符串与月份计算
  care-schedule.ts       跨端照护周期判断
  vaccine-plan.ts        跨端疫苗时间表与计划生成

public/
  manifest.webmanifest   PWA 元数据
  sw.js                  由 scripts/build-sw.mjs 在构建时生成（预缓存清单 + 自动版本号）
  icons/                 图标
  illustrations/         空状态插画
  milestones/            里程碑图标（webp）

scripts/
  build-sw.mjs            构建后生成 dist/sw.js（预缓存清单与缓存版本）
  check-css.mjs           CSS 基础结构检查
  ensure-data.mjs         启动前校验 DATA_DIR 可写
  optimize-images.py      默认只读的图片检查与可选批量优化

android-app/
  app/src/main/         WebView 壳、服务器配置和 Android 资源
  design/               App 图标设计源文件
  gradle/               Gradle Wrapper
```

## 3. 数据与时间

### 3.1 数据目录

默认：

```text
data/
  baby-care.db
  baby-care.db-wal
  baby-care.db-shm
  backups/
  uploads/avatars/
```

路径规则：

- `DATABASE_PATH` 默认为 `./data/baby-care.db`。
- `DATA_DIR` 显式设置时用于头像和相关持久化资源。
- Docker 中 `DATA_DIR=/data`，宿主机目录通过 volume 挂载。
- 旧的 `server/uploads/` 不再使用。

### 3.2 时间约定

- 瞬时时间存 ISO 8601 UTC 字符串，如 `occurred_at`、`created_at`。
- 自然日存 `YYYY-MM-DD`，如出生、测量、计划、预约和接种日期。
- 时间存 `HH:MM`，如预约和提醒时间。
- 日报、推送和日范围统计以 `Asia/Shanghai` 为准。
- 日期字符串在中午构造后再显示，避免 UTC 隐式换日。
- Docker 设置 `TZ=Asia/Shanghai`；关键推送日期仍优先使用显式上海时区工具。

### 3.3 疫苗建议日期

前端 `src/vaccines.ts` 和服务端 `server/vaccine-plan.ts` 共同调用 `shared/vaccine-plan.ts`，避免首页、疫苗安排和推送出现不同计算结果。统一规则为：

1. 以出生日期次日为基准。
2. 目标月遇到月末时夹到该月最后一天，再加一天；因此可能自然进入下月。
3. 已保存 `plannedOn` 覆盖系统建议。
4. `appointmentOn` 只改变提醒和显示优先级，不覆盖建议日期。
5. 已接种和已删除记录不进入待办。
6. 联合疫苗和部分别名会满足对应默认剂次。

出生时间只存档，不参与建议日期计算。

## 4. SQLite 数据模型

数据库启动时执行幂等建表和兼容迁移，使用 WAL 和外键约束。

### 4.1 `profile`

固定单行 `id=1`：`name`、`birth_date`、`birth_time`、`sex`、`nickname`、`caregiver_title`、`avatar`、`updated_at`。

### 4.2 `care_records`

- `id`：UUID 文本主键。
- `type`：`feeding | supplement | bowel | note`。
- `occurred_at`：标准瞬时时间。
- `breast_milk_ml`、`formula_ml`、`supplement`、`bowel_size`、`subject`、`note`。
- `created_by`、`updated_by`、`deleted_at`、`deleted_by`。

删除为软删除；永久删除只允许处理已软删除记录。

### 4.3 `record_audit`

记录照护数据的 `create | update | delete | restore | import` 操作、执行人、时间和快照。

### 4.4 `care_items`

包含名称、`category`（`medication | care` 分类）、`icon`（`medicine | massage | bath | care`）、排序、启用状态，以及：

- `schedule_type`：`daily | interval | weekly | pattern | as_needed`。
- `interval_days`。
- `schedule_start_date`、`schedule_end_date`。
- `reminder_time`、`reminder_times`（多次提醒时间，JSON 数组）。
- `week_days`（weekly 的星期集合，JSON 数组）、`pattern_days`（pattern 的执行/休息循环，JSON 布尔数组）。
- `created_at`、`updated_at`。

### 4.5 `growth_records`

保存测量日期、身高、体重、AI 评估（`evaluation`）与评估时间（`evaluated_at`）、创建/修改人和软删除信息。同一自然日有重复保护。

### 4.6 `vaccine_records`

保存疫苗名、类型、剂次、人工计划、预约日期/时间、实际接种日期、备注、审计人和软删除信息。

### 4.7 `vaccine_catalog`

保存疫苗目录、类型、简称、说明、剂次数、程序摘要、启用状态、排序、系统标记（`is_system`）和软删除（`deleted_at`）。

系统维护 10 个默认项目；系统项目（`is_system=1`）不能修改内容或删除，只能启停。

### 4.8 配置和派生数据

- `family_permissions`：四个家庭身份的角色。
- `ai_settings`：provider、base URL、model、API key。
- `push_settings`：总开关、PushPlus、早报、喂奶阈值、单项提醒和去重标记。
- `daily_reports`：报告日期、摘要、建议、模型和生成时间。
- `schema_migrations`：数据迁移标记。

## 5. API

除登录选项、登录、健康检查和生产静态资源外，`server/index.ts` 会统一要求已登录。

### 5.1 会话与资料

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/session` | 公开 | 当前会话 |
| GET | `/api/login-options` | 公开 | 家庭身份列表 |
| POST | `/api/login` | 公开 | 登录 |
| POST | `/api/logout` | 登录 | 退出 |
| GET | `/api/profile` | 登录 | 宝宝资料 |
| PUT | `/api/profile` | 管理 | 修改资料 |
| POST | `/api/profile/avatar` | 管理 | 上传头像 |
| DELETE | `/api/profile/avatar` | 管理 | 删除头像 |
| GET | `/api/events` | 登录 | SSE 变更事件 |

### 5.2 家庭与 AI

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/family-members` | 超管 | 成员与角色 |
| PUT | `/api/family-members/:id/role` | 超管 | 调整角色 |
| GET/PUT | `/api/ai/settings` | 超管 | AI 设置 |
| POST | `/api/ai/settings/test` | 超管 | 测试模型连接 |
| GET | `/api/capabilities` | 登录 | 前端能力状态 |
| GET | `/api/daily-report` | 登录 | 获取/按需生成报告 |
| POST | `/api/daily-report/generate` | 登录 | 重新生成报告 |

### 5.2.1 AI 对话（按成员隔离）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/ai/chat` | 登录 | 发送对话，返回回复、会话与提取的记忆 |
| GET | `/api/ai/chat/sessions` | 登录 | 会话列表（超管可指定 `userId` 查看他人） |
| POST | `/api/ai/chat/sessions` | 登录 | 新建会话 |
| GET | `/api/ai/chat/sessions/:id/messages` | 登录 | 会话消息（仅本人或超管） |
| DELETE | `/api/ai/chat/sessions/:id` | 登录 | 删除会话（仅本人或超管） |
| GET | `/api/ai/memories` | 登录 | 家庭共享记忆 |
| POST | `/api/ai/memories` | 登录 | 新增记忆 |
| DELETE | `/api/ai/memories/:id` | 管理 | 删除单条记忆 |
| DELETE | `/api/ai/memories` | 管理 | 清空记忆 |

### 5.3 业务资源

照护记录：

- `GET/POST /api/records`
- `PUT/DELETE /api/records/:id`
- `GET /api/records/deleted`
- `POST /api/records/:id/restore`
- `DELETE /api/records/:id/permanent`
- `GET /api/records/:id/audit`

用药项目：

- `GET/POST /api/care-items`
- `PUT /api/care-items/order`
- `PUT /api/care-items/:id`
- `PATCH /api/care-items/:id/active`
- `GET /api/care-items/adherence`（近 30 天依从性统计）

喂养预测：

- `GET /api/feeding-prediction`（基于近 7 天喂奶间隔的预计喂奶与 AI 洞察缓存）

成长记录：

- `GET/POST /api/growth-records`
- `PUT/DELETE /api/growth-records/:id`
- `GET /api/growth-records/deleted`
- `POST /api/growth-records/:id/restore`
- `DELETE /api/growth-records/:id/permanent`
- `GET /api/growth-assessment`（身高体重参考区间与牛奶量评估）
- `POST /api/growth-records/:id/evaluation`（AI 生长评价）

里程碑记录：

- `GET/POST /api/milestone-records`
- `PUT/DELETE /api/milestone-records/:id`
- `GET /api/milestone-records/deleted`
- `POST /api/milestone-records/:id/restore`
- `DELETE /api/milestone-records/:id/permanent`

疫苗：

- `GET/POST /api/vaccine-records`
- `PUT/DELETE /api/vaccine-records/:id`
- `GET /api/vaccine-records/deleted`
- `POST /api/vaccine-records/:id/restore`
- `GET/POST /api/vaccine-catalog`
- `PUT/DELETE /api/vaccine-catalog/:id`
- `PATCH /api/vaccine-catalog/:id/active`
- `PUT /api/vaccine-catalog/order`

管理写操作和删除/恢复操作的精确权限以路由中间件为准。

### 5.4 备份与推送

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/export` | 导出 JSON（版本 10） |
| POST | `/api/import` | 导入 JSON；body 带 `mode: 'replace'` 全量替换（清除并覆盖）或 `mode: 'merge'` 增量合并（默认），操作前先保存当前快照 |
| GET | `/api/backups/status` | 自动备份状态（目录、保留 30 份、间隔 6 小时等） |
| GET | `/api/backups` | 服务器备份列表（含 `type: manual\|auto` 类型标签） |
| POST | `/api/backups` | 立即备份；body 可带 `type: 'manual'`（默认）或 `'auto'` |
| DELETE | `/api/backups/:name` | 删除指定服务器备份（仅超管） |
| POST | `/api/backups/:name/restore` | 完整恢复（替换核心数据，恢复前先保存当前状态） |
| GET | `/api/push/status` | 推送状态 |
| POST | `/api/push/settings` | 保存推送设置 |
| POST | `/api/push/test/morning-digest` | 测试早报 |
| POST | `/api/push/test/feeding-gap` | 测试喂奶提醒 |
| POST | `/api/push/test/care-item` | 测试单项提醒 |
| POST | `/api/push/enable` | 开启总开关 |
| POST | `/api/push/disable` | 关闭总开关 |
| GET | `/api/app-notifications` | Android APP 通知队列增量拉取（`clientId` + `after` 游标） |

备份和导入接口仅超管可用。PushPlus 设置仅超管展示；APP 通知按设备独立配置，装有原生壳的设备上普通用户也可设置本机通知。

## 6. 认证与权限

家庭密码来自环境变量：

- `FATHER_PASSWORD`
- `MOTHER_PASSWORD`
- `GRANDFATHER_PASSWORD`
- `GRANDMOTHER_PASSWORD`
- `SESSION_SECRET`

登录后发放 HMAC 签名、HttpOnly、SameSite=Strict、30 天有效的 Cookie。`COOKIE_SECURE=true` 时只通过 HTTPS 发送。

角色：

- `superadmin`：爸爸，固定不可降级。
- `admin`：管理身份。
- `member`：普通身份。

前端隐藏入口只改善体验；所有权限以服务端 `requireAdmin` 和 `requireSuperAdmin` 为准。操作人从会话写入，客户端不能指定。

## 7. 同步与离线

### 7.1 在线同步

写操作完成后服务端广播 `records`、`profile` 或 `all` 作用域。客户端用 EventSource 接收后进行 180ms 合并刷新。

若 SSE 未连接，客户端每 30 秒刷新。页面从后台回到可见状态时执行一次刷新。

### 7.2 离线写入

客户端按家庭身份保存：

- 最近资料和记录缓存。
- 新增、修改、删除、恢复操作队列。

网络错误时先生成乐观记录并入队；联网后顺序重放。明确的 4xx 业务冲突会丢弃对应队列项并提示，不会无限重试。

Service Worker 仅缓存静态壳和最近访问的 GET 资源；`/api/` 请求不进入缓存。生产构建才注册 `/sw.js`。

当前没有 Web Push、`PushManager` 或浏览器端 `Notification.requestPermission()`。Android 原生壳使用 `POST_NOTIFICATIONS` 和 `AlarmManager` 提供本地疫苗预约提醒。

## 8. PushPlus 调度

开启总推送后，服务端每 30 秒执行：

1. 早间日报：达到配置时间且当天未发送。
2. 喂奶间隔：按最近喂奶记录和两级阈值去重。
3. 单项提醒：项目恰好匹配当前 `HH:MM`、当天到期且未在内存中发送。

消息可进入 PushPlus 和 Android APP 队列。PushPlus Token 缺失时仅跳过该通道；存在近 30 天活跃的 APP 设备时，早报、喂奶和照护消息写入保留 7 天的队列。

注意：单项提醒的 `pushedToday` 是进程内集合，服务重启后会清空；早报和喂奶标记保存在数据库中。

早报疫苗部分使用 `server/vaccine-plan.ts` 动态生成完整计划，不只读取已保存的疫苗记录。

## 9. AI 日报

日报以北京时间前一天为统计范围，汇总喂养、用药、排便和笔记。配置模型后调用兼容接口生成摘要和建议；无模型时使用基础逻辑。

调度器负责启动补生成和每日生成。完整 API Key 只保存在 SQLite，公开状态仅返回配置状态和掩码。

当前没有语音上传、浏览器语音识别或自然语言转结构化记录接口。

## 10. 头像

上传流程：

1. 前端完成圆形裁剪并提交图片。
2. Multer 使用内存接收。
3. Sharp 输出 512 × 512 WebP。
4. 文件写入 `{DATA_DIR}/uploads/avatars/avatar_{uuid}.webp`。
5. 资料保存 `/avatars/{filename}`。

上传新头像或删除头像时会尝试清理旧文件。生产环境由 Express 暴露头像目录。

若配置目录不可写，服务端可能切换到系统临时目录并输出警告；该模式重启后文件会丢失，应修复 volume 和 UID 1000 权限。

## 11. 备份与恢复

### 11.1 应用内 JSON 备份

- 每 6 小时自动生成。
- 默认保留最近 30 份（`server/backup.ts backupRetention = 30`）。
- 写入临时文件后原子改名。
- 导出版本当前为 10。
- 包含资料（含出生时间）、照护/成长/疫苗记录、审计、目录、家庭权限和日报。
- 备份区分 `type = manual | auto`，列表 UI 显示"手动"或"自动"类型标签，可单独删除某条备份。
- "导入"支持两种模式：`replace` 全量替换（清除当前数据完整恢复）和 `merge` 增量合并。导入前、服务器恢复前均会先自动保存一份当前状态快照。

头像二进制文件不嵌入 JSON；备份中的头像字段只是 URL。因此完整灾难恢复必须同时备份整个 `DATA_DIR`。

### 11.2 Unraid 文件备份

`babycare.sh backup` 会停止本项目容器后归档数据目录、`.env` 和 Compose 配置，再恢复原运行状态。不要在应用运行时只复制单个 `.db` 文件，以免遗漏 WAL。

## 12. 构建与部署

本地开发：

```bash
npm install
npm run dev
```

统一质量检查：

```bash
npm run check
```

该命令依次执行单元测试、静态检查（Biome）、严格类型检查、生产构建和 CSS 结构检查。单项排查可使用 `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 或 `npm run check:css`。

图片维护工具依赖 Python 3 和 Pillow。`npm run images:check` 只列出受管图片，不写入；`npm run images:optimize` 才会创建 `public/.image-backup-*` 备份并原地优化。它不接入 `npm run check` 或生产构建，避免常规检查意外改写资源。

Docker Compose 关键约定：

- 对外端口默认 `5937`，容器内端口 `3000`。
- 数据目录挂载到 `/data`。
- `TZ=Asia/Shanghai`。
- 根文件系统只读，`/tmp` 使用 tmpfs。
- 健康检查同时验证 API 和生产前端文件。

生产环境建议置于 HTTPS 反向代理后并设置 `COOKIE_SECURE=true`，不要直接暴露服务端口到公网。

### 12.1 Android 壳

`android-app/` 独立构建，不进入 Web 的 Vite 或 Docker 流程。WebView 加载完整服务器根地址，并通过 `/api/health` 验证连接：

- 外网地址必须使用 HTTPS；局域网允许可信私网 HTTP/HTTPS。
- Cookie 由 WebView 持久化，并在 Activity 暂停、停止和销毁时主动落盘。
- 同一来源沿用服务端 30 天登录会话；协议、域名或端口变化会形成不同的 Cookie 与本地存储空间。
- `BabyCareNative` 提供通知权限、测试通知、疫苗预约提醒同步和系统日历日程写入界面。
- 疫苗提醒保存在 Android `SharedPreferences`，通过不精确的 `setAndAllowWhileIdle` 在预约前一天发送，避免申请精确闹钟特殊权限。
- Android 使用约 15 分钟的不精确后台轮询同步 APP 通知。每台设备本地保存总开关和四个分类开关，关闭的分类在展示前过滤。
- 日历使用 `CalendarContract` 的 `ACTION_INSERT`，仅预填日程并交由用户确认，不直接读写日历数据。普通浏览器下会下载 `.ics` 作为回退。
- 网页/API 更新只需重新部署服务器并刷新或重开 App；原生代码、图标、权限和 Android 配置变化必须提高版本号并重新安装 APK。
- 详细构建步骤见 [`../android-app/README.md`](../android-app/README.md)。

### 12.2 Unraid 部署脚本

项目根目录提供 `babycare.sh`，支持中文交互菜单和命令行两种模式，无需 Docker Compose 手动拼接参数。

无参数运行进入中文菜单：

```bash
./babycare.sh
```

菜单输出使用 `━━━━━━━━` 标题框、`──` 摘要面板和 `────────` 阶段分割线；步骤以 `[当前/总数]` 编号，状态符号统一为 `✓ ✗ ⚠ ℹ`。

命令行调用：

| 命令 | 别名 | 作用 |
|---|---|---|
| `./babycare.sh deploy` | `部署` | 首次部署或重新构建（含构建前自动备份、6 步流程：目录准备→配置校验→清理旧容器→构建镜像→启动健康检查→清理旧镜像） |
| `./babycare.sh update` | `更新` | 拉取 Git 最新代码后重新部署（执行前先备份，skip 重复备份） |
| `./babycare.sh backup` | `备份` | 停止容器→打包数据目录、`.env`、`docker-compose.yml`→恢复服务 |
| `./babycare.sh status` | `状态` | `docker compose ps` + 当前容器状态摘要 |
| `./babycare.sh logs` | `日志` | `compose logs --tail 100 -f` |
| `./babycare.sh stop` | `停止` | 停止项目服务 |
| `./babycare.sh start` | `启动` | 启动项目服务 |
| `./babycare.sh menu` | `菜单` | 打开中文交互菜单（无参数时默认行为） |
| `./babycare.sh help` | `-h --help` | 显示命令清单 |

部署脚本使用的关键约定：`HOST_PORT=5937`、`DATA_DIR` 指向 `.env` 配置的宿主机目录，Docker compose 项目名固定为 `babycare-website`。部署完成后输出摘要面板（容器名、端口、数据目录、备份目录、访问地址）。

## 13. 安全与输入校验

- Helmet 设置安全响应头。
- 登录失败按真实客户端 IP 限流；Express 开启 `trust proxy`。
- Cookie 为 HttpOnly 和 SameSite=Strict。
- Zod 校验请求和备份数据。
- UUID、日期、时间、数值范围和文件类型均在服务端复核。
- 头像限制大小并重新编码，原始文件不直接落盘。
- 密钥接口不返回完整值。

## 14. 故障排查

### 14.1 头像上传失败

检查：

```bash
ls -la /data/uploads/avatars
docker logs babycare-website
```

确认 volume 挂到 `/data`，目录属于 UID 1000 且可写。不要重新创建 `server/uploads/`。

### 14.2 PushPlus 不发送

依次检查：

1. 总开关和对应子开关是否开启。
2. Token 是否已配置，Topic 是否正确。
3. 设置页 `schedulerRunning` 和 `lastCheckAt`。
4. 容器时间与 `TZ=Asia/Shanghai`。
5. 服务日志中的 PushPlus HTTP 错误。

PushPlus 失败不会降级为浏览器通知。

### 14.3 设备不同步

检查 `/api/events` 是否保持连接、浏览器是否在线、反向代理是否缓冲 SSE。SSE 不可用时客户端应在 30 秒内轮询刷新。

### 14.4 疫苗日期不一致

检查出生日期、保存的 `plannedOn` 和 `appointmentOn`。系统建议统一从出生次日计算；历史手工计划不会因修改出生资料而自动覆盖。

## 15. 文档维护

- 业务规则变化先同步 `product.md`。
- 数据、接口、目录或调度变化同步本文。
- 视觉、组件和响应式变化同步 `ui-guidelines.md`。
- 未实现能力必须明确标注为规划，不得写成现有功能。
- README、产品、技术、UI 和 Android 文档的职责及更新条件以 [文档导航](./README.md) 为准。
