# 宝宝照护记录

手机和平板优先的家庭共享照护 APP，用于记录母乳、奶粉、AD、VD、益生菌、排便和其他情况。

## 主要功能

- 今日奶量、喂奶次数、排便次数和最近喂奶时间
- 母乳与奶粉分开记录
- AD、VD、益生菌一键记录
- 排便时间及大、中、小
- 历史日期浏览与搜索
- 七日奶量、喂奶次数和排便趋势
- AI 短语音转写，多条草稿确认后统一保存
- 未配置 AI 时明确使用浏览器语音，也可以手动记录
- 爸爸、妈妈、爷爷、奶奶独立身份登录
- 仅爸爸拥有宝宝资料、语音服务和数据备份管理权限
- 每条记录保存创建人和最后修改人
- 完整备份与事务恢复，包含宝宝资料、已删除记录和操作历史
- 软删除、撤销恢复和记录操作历史
- 同日同种用药重复保护
- 家庭设备离线暂存和恢复联网后的自动同步

## Unraid 部署

项目统一使用 `babycare-website` 作为包名、镜像名、Compose 服务名和容器名。默认目录如下，不会创建额外的 Unraid 共享目录：

```text
/mnt/user/appdata/baby-care/
├── app/       # GitHub 源码
├── data/      # SQLite 数据库
└── backups/   # 自动备份
```

### 首次部署

```bash
mkdir -p /mnt/user/appdata/baby-care
cd /mnt/user/appdata/baby-care
git clone --branch main https://github.com/x1ngodlike/babycare-website.git app
cd app
chmod +x babycare.sh
./babycare.sh
```

脚本显示全中文菜单：

```text
1. 首次部署或重新构建
2. 更新到 GitHub 最新版本
3. 备份数据
4. 查看运行状态
5. 查看实时日志
6. 停止服务
7. 启动服务
0. 退出
```

也可以直接使用中文命令：

```bash
./babycare.sh 部署
./babycare.sh 更新
./babycare.sh 备份
./babycare.sh 状态
./babycare.sh 日志
./babycare.sh 停止
./babycare.sh 启动
```

“更新”会依次备份数据库、拉取 GitHub 最新代码、删除本项目以前创建的新旧容器、构建镜像并创建唯一的 `babycare-website` 容器。脚本不会删除 `/mnt/user/appdata/baby-care/data`，也不会操作其他 Unraid 应用。

每次备份都会短暂停止正在运行的本项目容器，完整保存数据库目录、`.env` 和 Compose 配置，然后恢复原运行状态。备份固定保存在：

```text
/mnt/user/appdata/baby-care/backups
```

首次生成的 `.env` 使用爸爸密码 `qwe123`，妈妈、爷爷、奶奶密码 `111111`，并生成随机会话密钥。部署成功后建议修改密码，再执行 `./babycare.sh 部署`。

完整健康检查同时验证容器中的 `/app/dist/index.html`、网页首页和后端接口，避免只有后端启动而前端文件缺失。

### 恢复备份

先停止服务，并将当前数据目录改名保留。以下备份文件名需要替换为实际文件：

```bash
cd /mnt/user/appdata/baby-care/app
./babycare.sh 停止
mkdir -p /mnt/user/appdata/baby-care/restore-temp
tar -xzf /mnt/user/appdata/baby-care/backups/babycare-website-日期时间.tar.gz \
  -C /mnt/user/appdata/baby-care/restore-temp
mv /mnt/user/appdata/baby-care/data \
  /mnt/user/appdata/baby-care/data.before-restore
mv /mnt/user/appdata/baby-care/restore-temp/data \
  /mnt/user/appdata/baby-care/data
cp /mnt/user/appdata/baby-care/restore-temp/.env .env
chown -R 1000:1000 /mnt/user/appdata/baby-care/data
./babycare.sh 部署
```

确认恢复后的记录无误，再自行处理 `data.before-restore`；它是恢复前的数据副本。

SQLite 数据库存放在 `data/baby-care.db`。不要只复制单个数据库文件，以免遗漏 WAL 中尚未合并的记录。升级前也可以在“设置 → 数据备份”导出完整 JSON。

## AI 语音识别

在 `.env` 中配置：

```env
OPENAI_API_KEY=你的服务端API密钥
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

API Key 只在 Node 后端读取，不会发送到网页。前端录制不超过 20 秒的短音频，后端以临时内存方式转发给语音转写接口，不写入磁盘；转写结果解析成记录草稿，用户确认后才保存。

手机浏览器通常需要 HTTPS 才能稳定使用麦克风。正式使用建议通过 Nginx Proxy Manager、Tailscale 或 Cloudflare Tunnel 配置 HTTPS，并将 `.env` 中 `COOKIE_SECURE` 改为 `true`。不要把 3000 端口直接暴露到公网。

## 本地开发

```bash
npm install
npm run dev
```

- APP：`http://localhost:5173`
- API：`http://localhost:3000`
- 默认密码：爸爸 `qwe123`；妈妈、爷爷、奶奶均为 `111111`

## 家庭身份与权限

- 爸爸：唯一管理员，可以修改宝宝资料、查看语音服务状态、导入和导出数据。
- 妈妈、爷爷、奶奶：普通用户，可以查看、添加、修改和删除照护记录，也可以使用智能语音。
- 创建和修改记录时，服务器根据登录会话自动写入操作人，网页不能伪造。
- 升级前的既有记录统一标记为“历史数据”。

## 检查与构建

```bash
npm run typecheck
npm test
npm run build
```

## 数据与隐私

- 语音原文只用于生成待确认草稿，不写入照护记录数据库。
- 配置 AI 后，短音频会发送给所选择的 AI 服务处理。
- 应用没有公开注册入口，适合作为家庭内部工具。
- 建议定期在“设置 → 数据备份”导出 JSON 文件。

## 历史打印版

重构前的静态打印项目保存在 APP 仓库外的 `../print-schedule/`，不会进入 Git、Docker 镜像或生产构建。
