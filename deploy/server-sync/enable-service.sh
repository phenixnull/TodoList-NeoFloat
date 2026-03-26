#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="neo-float-todo-sync.service"
APP_DIR="/srv/neo-float-todo-sync"
SERVICE_FILE="${APP_DIR}/${SERVICE_NAME}"
SYSTEMD_DIR="/etc/systemd/system"

cp "${SERVICE_FILE}" "${SYSTEMD_DIR}/${SERVICE_NAME}"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl status "${SERVICE_NAME}" --no-pager
