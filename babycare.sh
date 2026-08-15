#!/usr/bin/env bash
set -Eeuo pipefail

# babycare Unraid 统一管理脚本。
# 无参数运行时显示中文菜单，直接命令使用 deploy、update、backup 等英文名称。

# ===== 基础常量 =====
PROJECT_NAME="babycare-website"                    # Compose 项目名（决定容器/网络/卷的命名前缀）
SERVICE_NAME="babycare-website"                    # docker-compose.yml 里的服务名
CONTAINER_NAME="babycare-website"                  # 运行中的容器名（唯一）
LEGACY_CONTAINERS=("baby-care")                    # 历史旧容器名，清理和备份时都要兼顾
DEFAULT_HOST_PORT="5937"                           # .env 未配置时的默认 Web 端口
DEFAULT_DATA_DIR="/mnt/user/appdata/baby-care/data"  # 默认数据目录（SQLite 数据库 + 头像上传）
BACKUP_DIR="/mnt/user/appdata/baby-care/backups"   # 备份归档目录
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"  # 脚本所在目录（即项目根目录）
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"         # 环境配置文件路径，可用环境变量覆盖

# ===== 运行时状态（每次调用时重新填充） =====
HOST_PORT=""                    # 实际使用的端口（来自 .env 或默认值）
DATA_DIR=""                     # 实际使用的数据目录（来自 .env 或默认值）
COMPOSE_CMD=()                  # Compose 命令（docker compose 或 docker-compose）
STOPPED_FOR_BACKUP=()           # 备份期间被暂停的容器列表，结束后按此恢复
OLD_PROJECT_IMAGE_IDS=()        # 部署前记住的旧镜像 ID，新版健康检查通过后再清理

# 终端输出颜色：仅在交互式终端启用；输出重定向到文件时自动禁用，避免日志里出现转义乱码。
if [[ -t 1 ]]; then
  RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; CYAN=$'\e[36m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# 输出一行带前缀的提示信息（正常流程信息，前缀青色）。
info() {
  printf '\n%s[babycare]%s %s\n' "$CYAN" "$RESET" "$1"
}

# 输出错误信息（红色）并以非零码退出，终止脚本。
fail() {
  printf '\n%s[错误] %s%s\n' "$RED" "$1" "$RESET" >&2
  exit 1
}

# 从 .env 读取单个配置值，不执行文件中的任何命令。
read_env_value() {
  local key="$1"
  local value=""
  if [[ -f "$ENV_FILE" ]]; then
    value="$(awk -F= -v wanted="$key" '$1 == wanted {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")"
  fi
  printf '%s' "$value"
}

# 统一调用 Compose，固定项目名，避免不同目录产生重复容器。
# BUILDKIT_PROGRESS=plain：关闭构建动画进度条（非交互终端里逐帧刷屏），改为每步骤一行日志。
compose() {
  HOST_PORT="$HOST_PORT" DATA_DIR="$DATA_DIR" BUILDKIT_PROGRESS=plain "${COMPOSE_CMD[@]}" \
    --project-name "$PROJECT_NAME" \
    --project-directory "$SCRIPT_DIR" \
    --env-file "$ENV_FILE" "$@"
}

# 检查 Unraid 上部署和备份所需的基础命令。
prepare_runtime() {
  command -v docker >/dev/null 2>&1 || fail "未找到 Docker，请先在 Unraid 中启用 Docker 服务。"
  command -v curl >/dev/null 2>&1 || fail "未找到 curl，无法执行服务健康检查。"
  command -v tar >/dev/null 2>&1 || fail "未找到 tar，无法执行数据备份。"
  docker info >/dev/null 2>&1 || fail "Docker 服务未运行，或当前用户没有访问权限。"

  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    fail "未找到 Docker Compose，请安装 Compose Manager 或更新 Docker。"
  fi

  [[ -f "${SCRIPT_DIR}/docker-compose.yml" && -f "${SCRIPT_DIR}/Dockerfile" ]] \
    || fail "脚本必须放在包含 docker-compose.yml 和 Dockerfile 的项目根目录。"
}

# 首次部署时生成环境配置；已有配置永远不会被覆盖。
ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    command -v openssl >/dev/null 2>&1 || fail "生成会话密钥需要 openssl。"
    local session_secret
    session_secret="$(openssl rand -hex 32)"
    umask 077
    cat >"$ENV_FILE" <<EOF
FATHER_PASSWORD=qwe123
MOTHER_PASSWORD=111111
GRANDFATHER_PASSWORD=111111
GRANDMOTHER_PASSWORD=111111
SESSION_SECRET=${session_secret}
BIND_ADDRESS=0.0.0.0
HOST_PORT=${DEFAULT_HOST_PORT}
DATA_DIR=${DEFAULT_DATA_DIR}
COOKIE_SECURE=false
EOF
    info "已生成环境配置 ${ENV_FILE}，文件权限仅允许当前用户访问。"
  else
    chmod 600 "$ENV_FILE"
  fi
}

# 校验端口、数据目录和生产环境必填配置。
load_config() {
  local required_key
  for required_key in FATHER_PASSWORD MOTHER_PASSWORD GRANDFATHER_PASSWORD GRANDMOTHER_PASSWORD SESSION_SECRET; do
    [[ -n "$(read_env_value "$required_key")" ]] || fail ".env 缺少必填项：${required_key}"
  done

  local session_secret
  session_secret="$(read_env_value SESSION_SECRET)"
  (( ${#session_secret} >= 32 )) || fail "SESSION_SECRET 至少需要 32 个字符。"

  HOST_PORT="$(read_env_value HOST_PORT)"
  HOST_PORT="${HOST_PORT:-$DEFAULT_HOST_PORT}"
  DATA_DIR="$(read_env_value DATA_DIR)"
  DATA_DIR="${DATA_DIR:-$DEFAULT_DATA_DIR}"

  [[ "$HOST_PORT" =~ ^[0-9]+$ ]] || fail "HOST_PORT 必须是数字。"
  (( HOST_PORT >= 1 && HOST_PORT <= 65535 )) || fail "HOST_PORT 必须在 1 到 65535 之间。"
  [[ "$DATA_DIR" == /mnt/user/appdata/* ]] || fail "数据目录必须位于 /mnt/user/appdata/ 下。"
  [[ "$BACKUP_DIR" == /mnt/user/appdata/baby-care/backups ]] || fail "备份目录配置不符合安全限制。"
}

# 三步初始化：检查运行环境 → 准备 .env → 校验配置，所有子命令的公共入口。
initialize() {
  prepare_runtime
  ensure_env
  load_config
}

# 备份时停止所有已知的本项目容器，完成后恢复原运行状态。
restart_after_backup() {
  local name
  for name in "${STOPPED_FOR_BACKUP[@]}"; do
    docker start "$name" >/dev/null 2>&1 || true
  done
  STOPPED_FOR_BACKUP=()
}

# 按容器名停止单个容器并登记到 STOPPED_FOR_BACKUP；已在列表中则跳过，避免重复停止。
stop_for_backup() {
  local name="$1"
  local stopped_name
  for stopped_name in "${STOPPED_FOR_BACKUP[@]}"; do
    [[ "$stopped_name" == "$name" ]] && return 0
  done
  if [[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)" == "true" ]]; then
    info "暂时停止容器 ${name}，确保 SQLite 备份一致。"
    docker stop "$name" >/dev/null
    STOPPED_FOR_BACKUP+=("$name")
  fi
}

# 备份全流程：暂停本项目容器（保证 SQLite 一致）→ 打包数据目录和配置 → 恢复容器运行。
perform_backup() {
  initialize
  [[ -d "$DATA_DIR" ]] || fail "数据目录不存在：${DATA_DIR}"

  STOPPED_FOR_BACKUP=()
  local name
  for name in "$CONTAINER_NAME" "${LEGACY_CONTAINERS[@]}"; do
    stop_for_backup "$name"
  done
  while IFS= read -r name; do
    [[ -n "$name" ]] && stop_for_backup "$name"
  done < <(docker ps -a --filter "label=com.docker.compose.project.working_dir=${SCRIPT_DIR}" --format '{{.Names}}')
  # 兜底：无论备份正常结束、失败退出还是收到 Ctrl+C/终止信号，都恢复容器运行。
  trap restart_after_backup EXIT
  trap 'exit 130' INT TERM

  mkdir -p "$BACKUP_DIR"
  chmod 750 "$BACKUP_DIR"
  local timestamp archive
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  archive="${BACKUP_DIR}/babycare-website-${timestamp}.tar.gz"

  # 两段 -C 分别切换目录：先打包整个数据目录（含数据库名），再打包项目里的 .env 和 Compose 配置。
  if ! tar -czf "$archive" \
    -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" \
    -C "$SCRIPT_DIR" .env docker-compose.yml; then
    restart_after_backup
    trap - EXIT INT TERM
    fail "备份失败，原服务已尝试恢复。"
  fi
  chmod 600 "$archive"
  restart_after_backup
  trap - EXIT INT TERM

  info "${GREEN}备份完成：${archive}${RESET}"
  printf '备份内容：完整数据库目录、环境配置和 Compose 配置。\n'
}

# 记住部署前本项目正在使用的镜像，新版健康后再精确清理。
remember_project_images() {
  OLD_PROJECT_IMAGE_IDS=()
  local image_id=""
  local reference
  for reference in "${PROJECT_NAME}:latest" "$CONTAINER_NAME" "${LEGACY_CONTAINERS[@]}"; do
    if [[ "$reference" == *:* ]]; then
      image_id="$(docker image inspect -f '{{.Id}}' "$reference" 2>/dev/null || true)"
    else
      image_id="$(docker inspect -f '{{.Image}}' "$reference" 2>/dev/null || true)"
    fi
    [[ -n "$image_id" ]] || continue
    local known="false"
    local existing
    for existing in "${OLD_PROJECT_IMAGE_IDS[@]}"; do
      [[ "$existing" == "$image_id" ]] && known="true"
    done
    [[ "$known" == "false" ]] && OLD_PROJECT_IMAGE_IDS+=("$image_id")
  done
}

# 新版已通过健康检查时，只删除刚才记住且已不再被使用的本项目旧镜像。
cleanup_previous_project_images() {
  local current_image
  current_image="$(docker inspect -f '{{.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  [[ -n "$current_image" ]] || return 0

  local old_image used_by
  for old_image in "${OLD_PROJECT_IMAGE_IDS[@]}"; do
    [[ -n "$old_image" && "$old_image" != "$current_image" ]] || continue
    docker image inspect "$old_image" >/dev/null 2>&1 || continue
    used_by="$(docker ps -aq --filter "ancestor=${old_image}")"
    if [[ -n "$used_by" ]]; then
      printf '%s保留仍被其他容器使用的旧镜像：%s%s\n' "$YELLOW" "$old_image" "$RESET"
      continue
    fi
    if docker image rm "$old_image" >/dev/null 2>&1; then
      printf '%s已删除本项目上一版旧镜像：%s%s\n' "$GREEN" "$old_image" "$RESET"
    else
      printf '%s警告：旧镜像 %s 暂时无法删除，不影响新版运行。%s\n' "$YELLOW" "$old_image" "$RESET" >&2
    fi
  done
}

# 每次部署前移除本项目的新旧容器和孤立容器，不影响其他 Unraid 应用。
remove_project_containers() {
  info "停止并移除本项目以前创建的容器。"
  compose down --remove-orphans >/dev/null 2>&1 || true

  local name
  for name in "$CONTAINER_NAME" "${LEGACY_CONTAINERS[@]}"; do
    if docker inspect "$name" >/dev/null 2>&1; then
      if docker rm -f "$name" >/dev/null 2>&1; then
        printf '%s已删除旧容器：%s%s\n' "$GREEN" "$name" "$RESET"
      elif docker inspect "$name" >/dev/null 2>&1; then
        fail "无法删除旧容器：${name}"
      fi
    fi
  done

  local project_ids=()
  while IFS= read -r project_id; do
    [[ -n "$project_id" ]] && project_ids+=("$project_id")
  done < <(docker ps -aq --filter "label=com.docker.compose.project.working_dir=${SCRIPT_DIR}")
  if (( ${#project_ids[@]} > 0 )); then
    docker rm -f "${project_ids[@]}" >/dev/null
    printf '%s已删除同一项目目录产生的孤立容器。%s\n' "$GREEN" "$RESET"
  fi
}

# 部署全流程：预备份 → 准备目录 → 清理旧容器 → 构建镜像 → 启动 → 健康检查 → 清理旧镜像。
perform_deploy() {
  initialize

  # 数据目录已有内容时，部署前自动生成一致性备份；更新流程可通过环境变量避免重复备份。
  if [[ "${BABYCARE_SKIP_BACKUP:-false}" != "true" && -d "$DATA_DIR" ]] \
    && find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    perform_backup
  fi

  mkdir -p "$DATA_DIR" "$DATA_DIR/uploads/avatars" "$BACKUP_DIR"
  # 1000:1000 与容器内运行用户的 UID/GID 一致，保证数据库和头像目录可读写。
  chown -R 1000:1000 "$DATA_DIR" "$BACKUP_DIR" 2>/dev/null || true
  chmod 750 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/uploads/avatars" "$BACKUP_DIR" 2>/dev/null || true

  info "校验 Compose 配置。"
  compose config --quiet
  remember_project_images
  remove_project_containers

  if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$HOST_PORT" >/dev/null 2>&1; then
    fail "端口 ${HOST_PORT} 已被其他服务占用，请修改 .env 中的 HOST_PORT。"
  fi

  info "构建 ${PROJECT_NAME} 镜像。"
  compose build --pull "$SERVICE_NAME"
  info "创建唯一的 ${CONTAINER_NAME} 容器。"
  compose up -d --remove-orphans "$SERVICE_NAME"

  info "检查前端文件、网页首页和后端接口。"
  # 健康检查：最多重试 30 次、每次间隔 2 秒（约 60 秒）。
  # 三项全过才算健康：容器内前端产物存在、首页可访问、/api/health 返回正常。
  local healthy="false"
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec "$CONTAINER_NAME" test -f /app/dist/index.html >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:${HOST_PORT}/" >/dev/null 2>&1; then
      healthy="true"
      break
    fi
    sleep 2
  done

  if [[ "$healthy" != "true" ]]; then
    compose logs --tail=120 "$SERVICE_NAME" >&2 || true
    fail "服务在 60 秒内未通过完整健康检查。"
  fi

  cleanup_previous_project_images

  local server_ip
  server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  server_ip="${server_ip:-你的-Unraid-IP}"
  compose ps
  info "${GREEN}部署完成。${RESET}"
  printf '访问地址：http://%s:%s\n' "$server_ip" "$HOST_PORT"
}

# 更新流程：先备份 → 校验 Git 工作区干净 → 拉取 main 最新代码 → 用新脚本重新部署。
perform_update() {
  initialize
  perform_backup
  command -v git >/dev/null 2>&1 || fail "未找到 Git，无法拉取更新。"
  [[ -d "${SCRIPT_DIR}/.git" ]] || fail "当前目录不是 Git 仓库。"
  # 工作区有未提交修改时拒绝更新，避免 pull 冲突覆盖本地改动。
  [[ -z "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no)" ]] \
    || fail "仓库存在未提交修改，请先处理后再更新。"

  info "从 GitHub 拉取 main 分支最新代码。"
  git -C "$SCRIPT_DIR" pull --ff-only origin main
  info "使用更新后的脚本重新部署。"
  # exec 替换当前进程运行新脚本；刚已备份过，用环境变量跳过 deploy 里的重复备份。
  BABYCARE_SKIP_BACKUP=true exec "${SCRIPT_DIR}/babycare.sh" deploy
}

# 查看本项目容器运行状态（Compose 视图 + 容器明细）。
show_status() {
  initialize
  compose ps
  printf '\n本项目相关容器：\n'
  docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format '名称：{{.Names}}　状态：{{.Status}}　镜像：{{.Image}}'
}

# 跟踪查看服务最近 100 行日志并持续输出（Ctrl+C 退出）。
show_logs() {
  initialize
  compose logs --tail=100 -f "$SERVICE_NAME"
}

# 停止服务容器（不删除，数据不受影响）。
stop_service() {
  initialize
  compose stop "$SERVICE_NAME"
  info "服务已停止。"
}

# 启动已停止的服务容器。
start_service() {
  initialize
  compose up -d "$SERVICE_NAME"
  info "服务已启动。"
}

# 无参数运行时的中文交互菜单。
show_menu() {
  printf '\nbabycare管理\n\n'
  printf '1. 首次部署或重新构建\n'
  printf '2. 更新到 GitHub 最新版本\n'
  printf '3. 备份数据\n'
  printf '4. 查看运行状态\n'
  printf '5. 查看实时日志\n'
  printf '6. 停止服务\n'
  printf '7. 启动服务\n'
  printf '0. 退出\n\n'
  read -r -p '请选择操作：' selection
  case "$selection" in
    1) perform_deploy ;;
    2) perform_update ;;
    3) perform_backup ;;
    4) show_status ;;
    5) show_logs ;;
    6) stop_service ;;
    7) start_service ;;
    0) exit 0 ;;
    *) fail "无效选项：${selection}" ;;
  esac
}

# 显示命令行帮助（./babycare.sh help）。
show_help() {
  printf '\n%sbabycare管理命令%s\n\n' "$BOLD" "$RESET"
  printf '  ./babycare.sh deploy   首次部署或重新构建\n'
  printf '  ./babycare.sh update   备份后更新到 GitHub 最新版本\n'
  printf '  ./babycare.sh backup   备份数据和环境配置\n'
  printf '  ./babycare.sh status   查看容器运行状态\n'
  printf '  ./babycare.sh logs     查看实时日志\n'
  printf '  ./babycare.sh stop     停止服务\n'
  printf '  ./babycare.sh start    启动服务\n'
  printf '  ./babycare.sh help     显示本帮助\n\n'
  printf '无参数运行 ./babycare.sh 可打开中文菜单。\n'
}

# 命令分发：无参数进入菜单；每个命令同时支持英文原名和中文别名。
case "${1:-菜单}" in
  菜单|menu) show_menu ;;
  deploy|部署) perform_deploy ;;
  update|更新) perform_update ;;
  backup|备份) perform_backup ;;
  status|状态) show_status ;;
  logs|日志) show_logs ;;
  stop|停止) stop_service ;;
  start|启动) start_service ;;
  help|-h|--help) show_help ;;
  *) fail "未知命令：${1}。请运行 ./babycare.sh help 查看可用命令。" ;;
esac
