#!/usr/bin/env bash
set -Eeuo pipefail

# babycare Unraid 统一管理脚本。
# 无参数运行时显示中文菜单，直接命令使用 deploy、update、backup 等英文名称。

# ===== 基础常量 =====
PROJECT_NAME="babycare-website"
SERVICE_NAME="babycare-website"
CONTAINER_NAME="babycare-website"
LEGACY_CONTAINERS=("baby-care")
DEFAULT_HOST_PORT="5937"
DEFAULT_DATA_DIR="/mnt/user/appdata/baby-care/data"
BACKUP_DIR="/mnt/user/appdata/baby-care/backups"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"

# ===== 运行时状态 =====
HOST_PORT=""
DATA_DIR=""
COMPOSE_CMD=()
STOPPED_FOR_BACKUP=()
OLD_PROJECT_IMAGE_IDS=()

# ===== 终端视觉配置 =====
if [[ -t 1 ]]; then
  RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; CYAN=$'\e[36m'
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RESET=$'\e[0m'
  STYLE_STEP="$CYAN"
  STYLE_OK="$GREEN"
  STYLE_ERR="$RED"
  STYLE_WARN="$YELLOW"
  STYLE_INFO="$CYAN"
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; DIM=''; RESET=''
  STYLE_STEP=''; STYLE_OK=''; STYLE_ERR=''; STYLE_WARN=''; STYLE_INFO=''
fi

# ===== 输出函数 =====
_step() {
  printf '\n%s[%s/%s]%s %s\n' "$STYLE_STEP" "$2" "$1" "$RESET" "$3"
}

_step_ok() {
  printf '  %s%s%s %s\n' "$STYLE_OK" "✓" "$RESET" "完成"
}

_step_fail() {
  printf '  %s%s%s %s\n' "$STYLE_ERR" "✗" "$RESET" "失败"
}

success() { printf '  %s%s%s %s\n' "$STYLE_OK" "✓" "$RESET" "$1"; }
warn()    { printf '  %s%s%s %s\n' "$STYLE_WARN" "⚠" "$RESET" "$1"; }
fail()    { printf '\n%s%s%s %s\n' "$STYLE_ERR" "✗" "$RESET" "$1" >&2; exit 1; }
info()    { printf '%s%s%s %s\n' "$STYLE_INFO" "ℹ" "$RESET" "$1"; }

_divider() { printf '%s%s%s\n' "$DIM" "────────────────────────────────" "$RESET"; }

_panel() {
  local title="$1"; shift
  printf '\n%s── %s ──%s\n' "$BOLD" "$title" "$RESET"
  local line
  for line in "$@"; do
    printf '  %s\n' "$line"
  done
}

_header() {
  printf '\n%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$BOLD" "$RESET"
  printf '%s  %s%s\n' "$BOLD" "$1" "$RESET"
  printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$BOLD" "$RESET"
}

# ===== 核心函数 =====
read_env_value() {
  local key="$1"
  local value=""
  [[ -f "$ENV_FILE" ]] && value="$(awk -F= -v wanted="$key" '$1 == wanted {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")"
  printf '%s' "$value"
}

compose() {
  HOST_PORT="$HOST_PORT" DATA_DIR="$DATA_DIR" BUILDKIT_PROGRESS=plain "${COMPOSE_CMD[@]}" \
    --project-name "$PROJECT_NAME" \
    --project-directory "$SCRIPT_DIR" \
    --env-file "$ENV_FILE" "$@"
}

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
    success "已生成环境配置 ${ENV_FILE}，文件权限仅允许当前用户访问。"
  else
    chmod 600 "$ENV_FILE"
  fi
}

load_config() {
  local key
  for key in FATHER_PASSWORD MOTHER_PASSWORD GRANDFATHER_PASSWORD GRANDMOTHER_PASSWORD SESSION_SECRET; do
    [[ -n "$(read_env_value "$key")" ]] || fail ".env 缺少必填项：${key}"
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
  _step 3 1 "检查运行环境"; prepare_runtime; _step_ok
  _step 3 2 "准备环境配置"; ensure_env; _step_ok
  _step 3 3 "校验配置"; load_config; _step_ok
}

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
  _divider

  _step 4 1 "备份前停止服务"
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
  _step_ok

  _step 4 2 "打包数据与配置"
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
    _step_fail
    fail "备份失败，原服务已尝试恢复。"
  fi
  chmod 600 "$archive"
  _step_ok

  _step 4 3 "恢复服务"
  restart_after_backup
  trap - EXIT INT TERM
  _step_ok

  _panel "备份完成" \
    "文件: ${archive}" \
    "内容: 数据库目录 + .env + docker-compose.yml"
}

remember_project_images() {
  OLD_PROJECT_IMAGE_IDS=()
  local image_id="" reference
  for reference in "${PROJECT_NAME}:latest" "$CONTAINER_NAME" "${LEGACY_CONTAINERS[@]}"; do
    if [[ "$reference" == *:* ]]; then
      image_id="$(docker image inspect -f '{{.Id}}' "$reference" 2>/dev/null || true)"
    else
      image_id="$(docker inspect -f '{{.Image}}' "$reference" 2>/dev/null || true)"
    fi
    [[ -n "$image_id" ]] || continue
    local known="false" existing
    for existing in "${OLD_PROJECT_IMAGE_IDS[@]}"; do
      [[ "$existing" == "$image_id" ]] && known="true"
    done
    [[ "$known" == "false" ]] && OLD_PROJECT_IMAGE_IDS+=("$image_id")
  done
}

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
      warn "保留仍被其他容器使用的旧镜像：${old_image}"
      continue
    fi
    if docker image rm "$old_image" >/dev/null 2>&1; then
      success "已删除本项目上一版旧镜像：${old_image}"
    else
      warn "旧镜像 ${old_image} 暂时无法删除，不影响新版运行。"
    fi
  done
}

remove_project_containers() {
  info "停止并移除本项目以前创建的容器。"
  compose down --remove-orphans >/dev/null 2>&1 || true

  local name
  for name in "$CONTAINER_NAME" "${LEGACY_CONTAINERS[@]}"; do
    if docker inspect "$name" >/dev/null 2>&1; then
      if docker rm -f "$name" >/dev/null 2>&1; then
        success "已删除旧容器：${name}"
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
    success "已删除同一项目目录产生的孤立容器。"
  fi
}

perform_deploy() {
  initialize

  if [[ "${BABYCARE_SKIP_BACKUP:-false}" != "true" && -d "$DATA_DIR" ]] \
    && find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    perform_backup
  fi

  _divider

  _step 6 1 "准备数据目录"
  mkdir -p "$DATA_DIR" "$DATA_DIR/uploads/avatars" "$BACKUP_DIR"
  chown -R 1000:1000 "$DATA_DIR" "$BACKUP_DIR" 2>/dev/null || true
  chmod 750 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/uploads/avatars" "$BACKUP_DIR" 2>/dev/null || true
  _step_ok

  _step 6 2 "校验 Compose 配置"
  compose config --quiet
  _step_ok

  _step 6 3 "清理旧容器"
  remember_project_images
  remove_project_containers
  if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$HOST_PORT" >/dev/null 2>&1; then
    fail "端口 ${HOST_PORT} 已被其他服务占用，请修改 .env 中的 HOST_PORT。"
  fi
  _step_ok

  _step 6 4 "构建镜像"
  compose build --pull "$SERVICE_NAME"
  _step_ok

  _divider

  _step 6 5 "启动服务"
  compose up -d --remove-orphans "$SERVICE_NAME"

  local healthy="false" attempt
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
    printf '\n'
    compose logs --tail=120 "$SERVICE_NAME" >&2 || true
    _step_fail
    fail "服务在 60 秒内未通过完整健康检查。"
  fi
  printf '  %s%s%s 健康检查 [%02d/30] 通过\n' "$STYLE_OK" "✓" "$RESET" "$attempt"
  _step_ok

  _divider

  _step 6 6 "清理旧镜像"
  cleanup_previous_project_images
  compose ps
  _step_ok

  local server_ip
  server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  server_ip="${server_ip:-你的-Unraid-IP}"
  _panel "部署完成" \
    "容器: ${CONTAINER_NAME}" \
    "端口: ${HOST_PORT}" \
    "数据: ${DATA_DIR}" \
    "备份: ${BACKUP_DIR}" \
    "访问: http://${server_ip}:${HOST_PORT}"
}

perform_update() {
  initialize
  perform_backup
  command -v git >/dev/null 2>&1 || fail "未找到 Git，无法拉取更新。"
  [[ -d "${SCRIPT_DIR}/.git" ]] || fail "当前目录不是 Git 仓库。"
  [[ -z "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no)" ]] \
    || fail "仓库存在未提交修改，请先处理后再更新。"

  _divider

  _step 2 1 "拉取最新代码"
  git -C "$SCRIPT_DIR" pull --ff-only origin main
  _step_ok

  _step 2 2 "重新部署"
  BABYCARE_SKIP_BACKUP=true exec "${SCRIPT_DIR}/babycare.sh" deploy
}

show_status() {
  initialize
  compose ps
  printf '\n当前运行容器：\n'
  docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format '  名称：{{.Names}}　状态：{{.Status}}　镜像：{{.Image}}'
}

show_logs() {
  initialize
  compose logs --tail=100 -f "$SERVICE_NAME"
}

stop_service() {
  initialize
  compose stop "$SERVICE_NAME"
  success "服务已停止。"
}

start_service() {
  initialize
  compose up -d "$SERVICE_NAME"
  success "服务已启动。"
}

show_menu() {
  _header "babycare 管理中心"
  printf '  1) 首次部署或重新构建\n'
  printf '  2) 更新到 GitHub 最新版本\n'
  printf '  3) 备份数据\n'
  printf '  4) 查看运行状态\n'
  printf '  5) 查看实时日志\n'
  printf '  6) 停止服务\n'
  printf '  7) 启动服务\n'
  printf '  0) 退出\n\n'
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

show_help() {
  _header "babycare 管理命令"
  printf '  ./babycare.sh deploy   首次部署或重新构建\n'
  printf '  ./babycare.sh update   备份后更新到最新版本\n'
  printf '  ./babycare.sh backup   备份数据和环境配置\n'
  printf '  ./babycare.sh status   查看容器运行状态\n'
  printf '  ./babycare.sh logs     查看实时日志\n'
  printf '  ./babycare.sh stop     停止服务\n'
  printf '  ./babycare.sh start    启动服务\n'
  printf '  ./babycare.sh help     显示本帮助\n'
  printf '\n提示：无参数运行 ./babycare.sh 可打开中文菜单。\n'
}

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
