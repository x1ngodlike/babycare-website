# 宝宝照护记录

手机和平板优先的家庭共享照护 APP，用于记录母乳、奶粉、AD、VD、益生菌、排便和其他情况。

## 主要功能

- 今日奶量、喂奶次数、排便次数和最近喂奶时间
- 母乳与奶粉分开记录
- AD、VD、益生菌、推拿等项目一键记录，管理员可新增、修改、停用、重新启用和拖动排序
- 排便时间及大、中、小
- 历史日期浏览与搜索
- 七日、月度和总数据趋势；月度每周奶量按周一至周日统计
- 每周身高体重记录，首页未记录时提醒，完成后收入宝宝档案
- 档案显示宝宝月龄、最新身高体重、历史变化和录入人
- AI 短语音转写和 DeepSeek 指令理解，多条草稿确认后统一保存
- 未配置 AI 时明确使用浏览器语音，也可以手动记录
- 爸爸、妈妈、爷爷、奶奶独立身份登录
- 爸爸固定为超管，可将妈妈、爷爷和奶奶设为管理员或普通用户；宝宝资料、家庭权限、语音服务和数据备份仍仅超管可管理
- 每条记录保存创建人和最后修改人
- 每 6 小时自动保存服务器备份，并支持手动备份、导出与事务恢复
- 管理员可软删除、查看已删除记录、恢复或二次确认后彻底删除
- 同日同种用药重复保护
- 家庭设备离线暂存和恢复联网后的自动同步
- 家庭成员新增或修改记录后，其他设备实时更新
- 首页、记录页和档案页支持移动端下拉刷新，实时连接不可用时自动低频检查

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

也可以直接使用英文命令：

```bash
./babycare.sh deploy
./babycare.sh update
./babycare.sh backup
./babycare.sh status
./babycare.sh logs
./babycare.sh stop
./babycare.sh start
```

“更新”会依次备份数据库、拉取 GitHub 最新代码、删除本项目以前创建的新旧容器、构建镜像并创建唯一的 `babycare-website` 容器。新容器通过完整健康检查后，脚本会精确删除本项目上一版且已不再被使用的镜像，不会全局清理其他 Unraid 应用的镜像或缓存。脚本不会删除 `/mnt/user/appdata/baby-care/data`。

每次备份都会短暂停止正在运行的本项目容器，完整保存数据库目录、`.env` 和 Compose 配置，然后恢复原运行状态。备份固定保存在：

```text
/mnt/user/appdata/baby-care/backups
```

首次生成的 `.env` 使用爸爸密码 `qwe123`，妈妈、爷爷、奶奶密码 `111111`，并生成随机会话密钥。部署成功后建议修改密码，再执行 `./babycare.sh deploy`。

完整健康检查同时验证容器中的 `/app/dist/index.html`、网页首页和后端接口，避免只有后端启动而前端文件缺失。

### 恢复备份

先停止服务，并将当前数据目录改名保留。以下备份文件名需要替换为实际文件：

```bash
cd /mnt/user/appdata/baby-care/app
./babycare.sh stop
mkdir -p /mnt/user/appdata/baby-care/restore-temp
tar -xzf /mnt/user/appdata/baby-care/backups/babycare-website-日期时间.tar.gz \
  -C /mnt/user/appdata/baby-care/restore-temp
mv /mnt/user/appdata/baby-care/data \
  /mnt/user/appdata/baby-care/data.before-restore
mv /mnt/user/appdata/baby-care/restore-temp/data \
  /mnt/user/appdata/baby-care/data
cp /mnt/user/appdata/baby-care/restore-temp/.env .env
chown -R 1000:1000 /mnt/user/appdata/baby-care/data
./babycare.sh deploy
```

确认恢复后的记录无误，再自行处理 `data.before-restore`；它是恢复前的数据副本。

SQLite 数据库存放在 `data/baby-care.db`。应用每 6 小时把完整 JSON 自动保存到 `data/backups/`，最多保留最近 28 份；Unraid 中对应 `/mnt/user/appdata/baby-care/data/backups/`，不会建立新的共享目录。爸爸可在设置页立即备份、选择服务器备份进行完整恢复，或手动导出和导入备份文件；服务器恢复前会先自动保存当前数据，恢复后宝宝资料、照护记录和操作历史与所选备份完全一致。不要在容器运行时只复制单个数据库文件，以免遗漏 WAL 中尚未合并的记录。

## 智能语音与模型配置

在 `.env` 中配置：

```env
OPENAI_API_KEY=你的服务端API密钥
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

API Key 只在 Node 后端读取，不会发送到网页。前端录制不超过 20 秒的短音频，后端以临时内存方式转发给语音转写接口，不写入磁盘；转写结果解析成记录草稿，用户确认后才保存。

爸爸登录后可以在“设置 → 指令理解模型”中填写 DeepSeek API 密钥。默认配置为：

```text
接口地址：https://api.deepseek.com
模型名称：deepseek-v4-flash
```

DeepSeek 负责把已经识别出的文字转换为喂奶、用药、排便或其他情况草稿，不直接把录音转换成文字。密钥保存在服务器 SQLite 数据库中，设置接口只返回是否已经配置和末四位提示，不会把完整密钥发送到网页。普通用户可以使用已配置的能力，但不能查看、测试或修改模型配置。

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

- 爸爸：超管，可在“档案”修改宝宝资料，并在点击顶部身份区后进入系统设置，管理家庭权限、用药项目、语音服务和备份。
- 妈妈、爷爷、奶奶：由超管设置为管理员或普通用户。管理员可管理用药项目和回收站；普通用户可查看、新增和修改照护记录。
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
- 服务器自动备份与数据库位于同一份 Unraid 存储，建议定期把导出的 JSON 文件另存到其他设备。

## 历史打印版

重构前的静态打印项目保存在 APP 仓库外的 `../print-schedule/`，不会进入 Git、Docker 镜像或生产构建。
