#!/usr/bin/env bash
set -Eeuo pipefail

# 宝宝照护记录 Unraid 统一管理脚本。
# 无参数运行时显示中文菜单，也支持“部署、更新、备份、状态、日志、停止、启动”等直接命令。

PROJECT_NAME="babycare-website"
SERVICE_NAME="babycare-website"
CONTAINER_NAME="babycare-website"
LEGACY_CONTAINERS=("baby-care")
DEFAULT_HOST_PORT="5937"
DEFAULT_DATA_DIR="/mnt/user/appdata/baby-care/data"
BACKUP_DIR="/mnt/user/appdata/baby-care/backups"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"

HOST_PORT=""
DATA_DIR=""
COMPOSE_CMD=()
STOPPED_FOR_BACKUP=()

info() {
  printf '\n[宝宝照护记录] %s\n' "$1"
}

fail() {
  printf '\n[错误] %s\n' "$1" >&2
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
compose() {
  HOST_PORT="$HOST_PORT" DATA_DIR="$DATA_DIR" "${COMPOSE_CMD[@]}" \
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
OPENAI_API_KEY=
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
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
  trap restart_after_backup EXIT
  trap 'exit 130' INT TERM

  mkdir -p "$BACKUP_DIR"
  chmod 750 "$BACKUP_DIR"
  local timestamp archive
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  archive="${BACKUP_DIR}/babycare-website-${timestamp}.tar.gz"

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

  info "备份完成：${archive}"
  printf '备份内容：完整数据库目录、环境配置和 Compose 配置。\n'
}

# 每次部署前移除本项目的新旧容器和孤立容器，不影响其他 Unraid 应用。
remove_project_containers() {
  info "停止并移除本项目以前创建的容器。"
  compose down --remove-orphans >/dev/null 2>&1 || true

  local name
  for name in "$CONTAINER_NAME" "${LEGACY_CONTAINERS[@]}"; do
    if docker inspect "$name" >/dev/null 2>&1; then
      docker rm -f "$name" >/dev/null
      printf '已删除旧容器：%s\n' "$name"
    fi
  done

  local project_ids=()
  while IFS= read -r project_id; do
    [[ -n "$project_id" ]] && project_ids+=("$project_id")
  done < <(docker ps -aq --filter "label=com.docker.compose.project.working_dir=${SCRIPT_DIR}")
  if (( ${#project_ids[@]} > 0 )); then
    docker rm -f "${project_ids[@]}" >/dev/null
    printf '已删除同一项目目录产生的孤立容器。\n'
  fi
}

perform_deploy() {
  initialize

  # 数据目录已有内容时，部署前自动生成一致性备份；更新流程可通过环境变量避免重复备份。
  if [[ "${BABYCARE_SKIP_BACKUP:-false}" != "true" && -d "$DATA_DIR" ]] \
    && find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    perform_backup
  fi

  mkdir -p "$DATA_DIR" "$BACKUP_DIR"
  chown 1000:1000 "$DATA_DIR"
  chmod 750 "$DATA_DIR" "$BACKUP_DIR"

  info "校验 Compose 配置。"
  compose config --quiet
  remove_project_containers

  if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$HOST_PORT" >/dev/null 2>&1; then
    fail "端口 ${HOST_PORT} 已被其他服务占用，请修改 .env 中的 HOST_PORT。"
  fi

  info "构建 ${PROJECT_NAME} 镜像。"
  compose build --pull "$SERVICE_NAME"
  info "创建唯一的 ${CONTAINER_NAME} 容器。"
  compose up -d --remove-orphans "$SERVICE_NAME"

  info "检查前端文件、网页首页和后端接口。"
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

  local server_ip
  server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  server_ip="${server_ip:-你的-Unraid-IP}"
  compose ps
  info "部署完成。"
  printf '访问地址：http://%s:%s\n' "$server_ip" "$HOST_PORT"
}

perform_update() {
  initialize
  perform_backup
  command -v git >/dev/null 2>&1 || fail "未找到 Git，无法拉取更新。"
  [[ -d "${SCRIPT_DIR}/.git" ]] || fail "当前目录不是 Git 仓库。"
  [[ -z "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no)" ]] \
    || fail "仓库存在未提交修改，请先处理后再更新。"

  info "从 GitHub 拉取 main 分支最新代码。"
  git -C "$SCRIPT_DIR" pull --ff-only origin main
  info "使用更新后的脚本重新部署。"
  BABYCARE_SKIP_BACKUP=true exec "${SCRIPT_DIR}/babycare.sh" 部署
}

show_status() {
  initialize
  compose ps
  printf '\n本项目相关容器：\n'
  docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format '名称：{{.Names}}　状态：{{.Status}}　镜像：{{.Image}}'
}

show_logs() {
  initialize
  compose logs --tail=100 -f "$SERVICE_NAME"
}

stop_service() {
  initialize
  compose stop "$SERVICE_NAME"
  info "服务已停止。"
}

start_service() {
  initialize
  compose up -d "$SERVICE_NAME"
  info "服务已启动。"
}

show_menu() {
  printf '\n宝宝照护记录管理\n\n'
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

case "${1:-菜单}" in
  菜单|menu) show_menu ;;
  部署|deploy) perform_deploy ;;
  更新|update) perform_update ;;
  备份|backup) perform_backup ;;
  状态|status) show_status ;;
  日志|logs) show_logs ;;
  停止|stop) stop_service ;;
  启动|start) start_service ;;
  *) fail "未知命令：${1}。可用命令：部署、更新、备份、状态、日志、停止、启动。" ;;
esac
