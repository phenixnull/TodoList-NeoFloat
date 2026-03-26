# Neo Float Todo Sync Deployment

This bundle is the server-side deployment for the desktop/mobile sync feature.

## Layout

- `dist/`: mobile web client
- `server/`: sync API server
- `data/`: persisted snapshots and uploaded task assets
- `todo-sync.env`: runtime configuration
- `run-sync-server.sh`: startup wrapper
- `neo-float-todo-sync.service`: systemd unit

## Minimal Start

```bash
cd /srv/neo-float-todo-sync
bash ./run-sync-server.sh
```

## systemd

```bash
sudo cp /srv/neo-float-todo-sync/neo-float-todo-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now neo-float-todo-sync.service
sudo systemctl status neo-float-todo-sync.service --no-pager
```

## Configure Clients

- Mobile URL: `http://SERVER_IP:8787/`
- Desktop sync URL: `http://SERVER_IP:8787`
- Token: stored only in `todo-sync.env`
