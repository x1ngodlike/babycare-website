# 宝宝照护记录 - 技术文档

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.8 | UI 框架 |
| TypeScript | 7.0.2 | 类型安全 |
| Vite | 8.2.1 | 构建工具 |
| Lucide React | 1.31.0 | 图标库 |
| Zod | 4.4.3 | 运行时验证 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | - | 运行时 |
| Express | 5.2.1 | Web 框架 |
| TypeScript | 7.0.2 | 类型安全 |
| tsx | 4.23.11 | 开发时 TS 执行 |
| better-sqlite3 | 13.0.3 | SQLite 驱动 |
| Multer | 2.2.0 | 文件上传 |
| Sharp | 0.35.3 | 图片处理 |
| Axios | 1.19.0 | HTTP 请求（AI、推送） |
| Helmet | 8.3.0 | 安全头 |

### 测试

| 技术 | 版本 | 用途 |
|------|------|------|
| Vitest | 4.1.10 | 测试框架 |

## 项目结构

```
babycare-website/
├── src/                          # 前端源码
│   ├── App.tsx                   # 主应用组件
│   ├── api.ts                    # API 封装
│   ├── types.ts                  # 类型定义
│   ├── styles.css                # 全局样式
│   ├── careSchedule.ts           # 照护计划逻辑
│   ├── DateField.tsx             # 日期输入组件
│   ├── ui.tsx                    # 通用 UI 组件
│   ├── VaccineViews.tsx          # 疫苗相关视图
│   ├── vaccines.ts               # 疫苗数据逻辑
│   └── offline.ts                # 离线处理
├── server/                       # 后端源码
│   ├── index.ts                  # 入口路由
│   ├── db.ts                     # 数据库操作
│   ├── auth.ts                   # 认证逻辑
│   ├── push.ts                   # 消息推送
│   ├── backup.ts                 # 数据备份
│   ├── ai.ts                     # AI 接口
│   └── shanghai-date.ts          # 上海时区日期工具
├── public/                       # 静态资源
│   ├── icons/                    # UI 图标
│   ├── illustrations/            # 插画资源
│   └── bear-bottle.png           # 默认头像
├── Dockerfile                    # Docker 构建
├── docker-compose.yml            # Docker Compose 配置
├── babycare.sh                   # Unraid 部署脚本
└── package.json                  # 项目配置
```

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      客户端                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │           React + Vite SPA                       │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐          │    │
│  │  │ 首页    │ │ 记录页  │ │ 档案页  │          │    │
│  │  └─────────┘ └─────────┘ └─────────┘          │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │           api.ts (API 封装)              │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      服务端                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Express Server                      │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐          │    │
│  │  │ 路由    │ │ 认证    │ │ 中间件  │          │    │
│  │  └─────────┘ └─────────┘ └─────────┘          │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │         业务逻辑层                        │    │    │
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────────┐   │    │    │
│  │  │  │ 推送 │ │ AI  │ │ 备份│ │ 图片处理│   │    │    │
│  │  │  └─────┘ └─────┘ └─────┘ └─────────┘   │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │              SQLite 数据库                        │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │         baby-care.db                     │    │    │
│  │  │  local_profile                          │    │    │
│  │  │  care_records                           │    │    │
│  │  │  care_items                             │    │    │
│  │  │  growth_records                         │    │    │
│  │  │  vaccine_records                        │    │    │
│  │  │  vaccine_catalog                        │    │    │
│  │  │  push_settings                          │    │    │
│  │  │  ai_settings                            │    │    │
│  │  │  ...                                    │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 数据流向

```
用户操作 → 前端 API 调用 → Express 路由 → 业务逻辑 → SQLite 写入
     ↑                                                        │
     │                                                        ▼
实时同步 ← WebSocket/轮询 ← 数据库变更通知
```

## 数据库设计

### 核心表结构

#### local_profile（宝宝资料）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，固定为 1 |
| name | TEXT | 姓名 |
| nickname | TEXT | 昵称（可选） |
| sex | TEXT | 性别 |
| birth_date | TEXT | 出生日期 |
| avatar | TEXT | 头像 URL |
| caregiver_title | TEXT | 称谓 |
| updated_at | TEXT | 更新时间 |

#### care_records（照护记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| type | TEXT | 记录类型 |
| occurred_at | TEXT | 发生时间 |
| amount_ml | REAL | 奶量（ml） |
| notes | TEXT | 备注 |
| created_by | TEXT | 创建人 |
| updated_by | TEXT | 修改人 |
| deleted | INTEGER | 是否已删除（0/1） |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

#### care_items（照护项目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 项目名称 |
| type | TEXT | 类型（medicine/massage/etc.） |
| reminder_time | TEXT | 提醒时间 |
| sort_order | INTEGER | 排序 |
| active | INTEGER | 是否启用 |

#### push_settings（推送设置）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，固定为 1 |
| enabled | INTEGER | 总开关（0/1） |
| pushplus_token | TEXT | PushPlus Token |
| pushplus_topic | TEXT | PushPlus Topic |
| morning_report_enabled | INTEGER | 早间日报开关 |
| morning_report_time | TEXT | 早报时间（HH:MM） |
| feeding_gap_level1_enabled | INTEGER | 轻度喂奶间隔开关 |
| feeding_gap_level1_minutes | INTEGER | 轻度阈值（分钟） |
| feeding_gap_level2_enabled | INTEGER | 重点喂奶间隔开关 |
| feeding_gap_level2_minutes | INTEGER | 重点阈值（分钟） |
| care_item_reminder_enabled | INTEGER | 用药照护提醒开关 |
| push_sent_flags | TEXT | JSON 推送状态记录 |
| updated_at | TEXT | 更新时间 |

## API 设计

### 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 获取当前用户 |
| PUT | `/api/auth/password` | 修改密码 |

### 宝宝资料

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/profile` | 获取宝宝资料 |
| PUT | `/api/profile` | 更新宝宝资料 |
| POST | `/api/profile/avatar` | 上传头像 |
| DELETE | `/api/profile/avatar` | 删除头像 |

### 照护记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/records?start=...&end=...` | 获取记录列表 |
| POST | `/api/records` | 新增记录 |
| PUT | `/api/records/:id` | 修改记录 |
| DELETE | `/api/records/:id` | 软删除记录 |
| POST | `/api/records/:id/restore` | 恢复已删除记录 |
| DELETE | `/api/records/:id/purge` | 彻底删除记录 |
| GET | `/api/records/deleted` | 获取已删除记录 |

### 照护项目

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/care-items` | 获取项目列表 |
| POST | `/api/care-items` | 新增项目 |
| PUT | `/api/care-items/:id` | 修改项目 |
| DELETE | `/api/care-items/:id` | 删除项目 |
| PUT | `/api/care-items/reorder` | 调整排序 |

### 成长记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/growth-records` | 获取成长记录 |
| POST | `/api/growth-records` | 新增记录 |
| PUT | `/api/growth-records/:id` | 修改记录 |
| DELETE | `/api/growth-records/:id` | 软删除记录 |
| POST | `/api/growth-records/:id/restore` | 恢复记录 |
| DELETE | `/api/growth-records/:id/purge` | 彻底删除 |
| GET | `/api/growth-records/deleted` | 获取已删除 |

### 消息推送

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/push/status` | 获取推送状态 | admin+ |
| POST | `/api/push/settings` | 保存推送设置 | admin+ |
| POST | `/api/push/enable` | 启用推送 | admin+ |
| POST | `/api/push/disable` | 禁用推送 | admin+ |
| POST | `/api/push/test/morning-report` | 测试早报推送 | admin+ |
| POST | `/api/push/test/feeding-gap` | 测试喂奶间隔推送 | admin+ |
| POST | `/api/push/test/care-item` | 测试照护提醒 | admin+ |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/backup` | 获取备份列表 |
| POST | `/api/backup` | 手动备份 |
| POST | `/api/backup/restore` | 恢复备份 |
| GET | `/api/ai/settings` | 获取 AI 配置 |
| PUT | `/api/ai/settings` | 保存 AI 配置 |
| POST | `/api/ai/test` | 测试 AI 连接 |
| GET | `/api/family/permissions` | 获取家庭权限 |
| PUT | `/api/family/permissions` | 更新家庭权限 |

## 权限模型

### 角色定义

```
ROLE: superadmin (爸爸)
  ├── 所有管理员权限
  ├── 修改宝宝资料
  ├── 管理家庭权限
  ├── 配置 AI 模型
  ├── 配置消息推送
  └── 数据备份/恢复

ROLE: admin (妈妈/爷爷/奶奶)
  ├── 所有普通用户权限
  ├── 软删除/恢复/彻底删除记录
  ├── 管理照护项目
  └── 查看/修改家庭权限（仅限非超管角色）

ROLE: member (其他)
  ├── 查看所有记录
  ├── 新增照护记录
  └── 修改自己创建的记录
```

### 权限校验

- 路由级中间件：`requireAdmin`、`requireSuperAdmin`
- 数据库级校验：创建人/修改人自动写入
- 前端级校验：按钮/菜单根据权限显示

## 实时同步

### 连接策略

```
1. 首选：WebSocket 持久化连接
2. 降级：HTTP 轮询（30 秒间隔）
3. 离线：本地暂存，恢复后同步
```

### 同步机制

- 新增记录时广播事件 `record:created`
- 修改记录时广播事件 `record:updated`
- 删除记录时广播事件 `record:deleted`
- 每 30 秒主动拉取增量更新

### 离线处理

```typescript
// 离线时记录暂存到 localStorage
const outbox = JSON.parse(localStorage.getItem('outbox') || '[]');

// 恢复联网后自动同步
async function syncOutbox() {
  for (const item of outbox) {
    await api.createRecord(item);
  }
  localStorage.removeItem('outbox');
}
```

## 消息推送

### 推送流程

```
定时任务 → 检查推送条件 → 构建消息模板 → 调用 PushPlus API → 微信接收
```

### 推送检查

每 60 秒执行一次检查：

```typescript
setInterval(() => {
  checkFeedingGap();      // 检查喂奶间隔
  checkMorningReport();   // 检查早间日报
  checkCareItems();       // 检查照护项提醒
}, 60_000);
```

### 推送模板

- 早间日报：每日 08:00 发送前一天总结
- 喂奶间隔：两级阈值（轻度 150min / 重点 180min）
- 照护提醒：按项目设置的提醒时间

### 状态持久化

推送状态存储在 `push_settings.push_sent_flags` JSON 字段中：
```json
{
  "morningReportSentDate": "2026-08-13",
  "lastFeedId": 123,
  "lastCheckLevel": "level2",
  "careItemReminders": {
    "vitamin_d": "2026-08-13T08:00:00"
  }
}
```

## 图片处理

### 头像上传

```
客户端：选择图片 → 本地裁剪 → 上传服务器
服务端：接收文件 → Sharp 压缩为 512×512 WebP → 存储到 DATA_DIR/uploads/avatars/
```

### 存储路径

```
生产环境：/data/uploads/avatars/avatar_{uuid}.webp
开发环境：./data/uploads/avatars/avatar_{uuid}.webp
```

### 访问方式

- 静态路由：`/avatars/avatar_{uuid}.webp`
- 缓存策略：30 天浏览器缓存

## AI 集成

### AI 配置

```
服务商：DeepSeek
接口地址：https://api.deepseek.com
默认模型：deepseek-v4-flash
```

### AI 功能

1. **语音转写辅助**：将语音识别结果发送给 AI，转换为结构化草稿
2. **指令理解**：将自然语言指令转换为具体操作
3. **日报生成**：每日凌晨自动生成前一天的宝宝日报

### 隐私保护

- AI 配置保存在服务器，不暴露给前端
- 前端只返回是否已配置和密钥末四位
- 语音原文不写入数据库

## 安全设计

### 认证

- 基于 Cookie 的会话认证
- HTTPOnly + Secure + SameSite 严格模式
- 登录失败限流（基于真实 IP）

### 授权

- 路由级权限校验中间件
- 数据级权限校验（创建人/修改人自动写入）
- 操作级权限校验（按钮/菜单根据权限显示）

### 输入验证

- 所有 API 输入使用 Zod 进行校验
- 文件上传限制类型和大小
- SQL 注入防护（参数化查询）

### 传输安全

- 生产环境推荐 HTTPS
- Cookie Secure 模式
- Helmet 安全头

## 部署架构

### Docker 部署

```
docker-compose.yml
├── 服务名：babycare-website
├── 端口映射：3000:3000
├── 数据卷：${DATA_DIR:-./data}:/data
├── 环境变量：
│   ├── NODE_ENV=production
│   ├── PORT=3000
│   ├── DATABASE_PATH=/data/baby-care.db
│   ├── DATA_DIR=/data
│   └── COOKIE_SECURE=false
└── 健康检查：/api/health
```

### Unraid 部署

```bash
./babycare.sh deploy    # 首次部署
./babycare.sh update    # 更新到最新版本
./babycare.sh backup    # 备份数据
./babycare.sh status    # 查看状态
./babycare.sh logs      # 查看日志
./babycare.sh stop      # 停止服务
./babycare.sh start     # 启动服务
```

### 目录结构

```
/mnt/user/appdata/baby-care/
├── app/                # GitHub 源码
├── data/               # SQLite 数据库
│   ├── baby-care.db
│   ├── uploads/
│   │   └── avatars/
│   └── backups/
└── backups/            # 自动备份
```

## 数据备份

### 自动备份

- 频率：每 6 小时
- 存储：`/data/backups/`
- 保留：最近 28 份

### 手动备份

- 管理员可在设置页触发
- 导出为 JSON 格式

### 恢复流程

1. 选择备份文件
2. 自动保存当前数据
3. 恢复所选备份
4. 前端提示恢复结果

## 性能优化

### 前端优化

- 首屏懒加载非关键数据
- 趋势数据进入页面时一次性聚合
- 状态更新按作用域定向刷新
- 组件使用 React.memo/useMemo/useCallback

### 后端优化

- better-sqlite3 同步操作，无异步开销
- 数据库索引优化常用查询
- 静态资源缓存 30 天
- 反向代理压缩

### 数据加载策略

| 页面 | 数据范围 |
|------|----------|
| 首页 | 昨天 + 今天（2 天） |
| 历史页 | 全量历史 |
| 趋势页 | 全量历史（进入时聚合） |

## 浏览器兼容性

- Chrome / Edge / Safari（最新 2 个版本）
- iOS Safari 15+
- Android Chrome 最新版
- 不支持 IE

## 可访问性

- WCAG 2.2 AA 级
- 键盘导航支持
- 屏幕阅读器语义
- 颜色对比度 ≥ 4.5:1
- 合理的文字大小和点击区域

## 测试

### 单元测试

```bash
npm test
```

- 框架：Vitest
- 覆盖率：核心业务逻辑 80%+
- 运行时：~500ms

### 类型检查

```bash
npm run typecheck
```

- 前端：tsc --noEmit
- 后端：tsc -p tsconfig.server.json --noEmit

## 监控与日志

### 日志级别

```
INFO  - 正常业务流程
WARN  - 可恢复的异常
ERROR - 需要人工介入的故障
```

### 日志输出

- 控制台输出（开发环境）
- 标准输出（生产环境，Docker 捕获）

### 关键日志点

- 服务启动/停止
- 数据库连接
- 推送发送结果
- 备份执行结果
- 登录失败
- API 错误

## 故障排查

### 常见问题

#### 头像上传失败

检查项：
1. 确认 `/data/uploads/avatars/` 目录存在且可写
2. 查看服务端日志中的错误信息
3. 确认 Nginx 上传大小限制（默认 1MB）

```bash
# 检查目录权限
ls -la /data/uploads/avatars/

# 查看服务日志
docker logs babycare-website
```

#### 推送不发送

检查项：
1. 确认推送开关已启用
2. 确认 PushPlus Token 正确
3. 确认网络可访问 pushplus.plus
4. 查看服务端日志中的推送错误

#### 数据不同步

检查项：
1. 确认网络连接正常
2. 刷新页面重新加载数据
3. 查看 localStorage 中的 outbox 队列

## 版本与变更

| 版本 | 日期 | 技术变更 |
|------|------|----------|
| v1.0.0 | 2026-08 | 初始版本：React 19 + Express 5 + SQLite |

## 联系方式

如有技术问题，请参考：
- [README.md](../README.md) - 部署说明
- [ui-guidelines.md](ui-guidelines.md) - UI 设计规范
- [product.md](product.md) - 产品文档
