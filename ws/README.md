# 🛰️ Codyx WebSocket Server Setup

This document summarizes the process for bringing up a **secure, demo-friendly WebSocket endpoint** on an **Amazon Linux EC2** instance using **Nginx**, **Certbot**, **PM2**, and optionally the **@y/websocket-server** package.

---

## 1️⃣ Instance & Environment

* **OS:** Amazon Linux 2
* **Domain:** `ws.codyx.io` (DNS managed by Vercel)
* **Elastic IP:** assigned to the EC2 instance

### Install prerequisites

```bash
sudo yum update -y
sudo yum install -y nginx nodejs npm
```

---

## 2️⃣ DNS → EC2

In Vercel DNS:

```
Type: A
Name: ws
Value: <your Elastic IP>
TTL: 3600
```

Verify:

```bash
dig +short ws.codyx.io
```

---

## 3️⃣ Nginx Configuration (with minimal hardening)

### Define rate/connection zones globally

`limit_req_zone` and `limit_conn_zone` **must** be placed in the `http` context of `/etc/nginx/nginx.conf`, *not* in site-specific configs.

Add these lines inside the top-level `http { ... }` block in `/etc/nginx/nginx.conf`:

```nginx
limit_req_zone  $binary_remote_addr zone=ws_rl:10m  rate=20r/s;
limit_conn_zone $binary_remote_addr zone=ws_conn:10m;
```

Then create `/etc/nginx/conf.d/ws.codyx.io.conf`:

```nginx
# HTTP → HTTPS redirect
server {
  listen 80;
  server_name ws.codyx.io;
  return 301 https://$host$request_uri;
}

# Token whitelist for light demo gating
map $arg_token $ok_token {
  default 0;
  some_random_token 1;
}

# HTTPS + WebSocket proxy
server {
  listen 443 ssl;
  server_name ws.codyx.io;

  ssl_certificate     /etc/letsencrypt/live/ws.codyx.io/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ws.codyx.io/privkey.pem;

  ssl_session_cache shared:le_nginx_SSL:10m;
  ssl_session_timeout 10m;

  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  # Simple health & discovery endpoints
  location /health     { return 200 "ok\n"; add_header Content-Type text/plain; add_header Cache-Control "no-store"; }
  location /demotoken  { return 200 "some_random_token\n"; add_header Content-Type text/plain; add_header Cache-Control "no-store"; }

  # Slightly obfuscated WebSocket endpoint
  location /ws-codyx/ {
    if ($ok_token = 0) { return 403; }

    limit_req  zone=ws_rl  burst=60 nodelay;
    limit_conn ws_conn 100;

    proxy_pass http://127.0.0.1:8080/;   # strip /ws-codyx/
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    access_log off;
  }
}
```

Then test and reload:

```bash
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl start nginx
```

Open **ports 80 & 443** in your EC2 Security Group.

---

## 4️⃣ HTTPS Certificates (Certbot + Let’s Encrypt)

```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot certonly --webroot -w /usr/share/nginx/html -d ws.codyx.io
sudo certbot renew --dry-run
```

---

## 5️⃣ Option A — Minimal WebSocket Server (basic Node script)

Create `/home/ec2-user/ws_server/server.js`:

```js
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', ws => {
  console.log('client connected');
  ws.send('hello from ws.codyx.io');
  ws.on('message', msg => ws.send(`echo: ${msg}`));
});
console.log('WebSocket server running on :8080');
```

Install and run:

```bash
npm install ws
node server.js
```

---

## 6️⃣ Option B — Yjs WebSocket Server (collaborative editing)

If you’re using **Stryng** or Yjs clients, use the official Yjs server instead of a basic echo server.

### Install and run

```bash
npm install -g pm2 @y/websocket-server
pm2 start "PORT=8080 HOST=127.0.0.1 npx y-websocket" --name yws
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

### Client configuration (Stryng)

```ts
new Stryng({
  transport: 'websocket',
  room: 'demo',
  websocket: { url: 'wss://ws.codyx.io/ws-codyx' }
});
```

> Note: The `/ws-codyx/` prefix is stripped by Nginx; the Yjs server receives `/demo`.

### Testing

```bash
wscat -c "wss://ws.codyx.io/ws-codyx/demo?token=some_random_token"
# Expect: Connected
```

---

## 7️⃣ Process Management (PM2)

If you used the **manual Node script**:

```bash
sudo npm install -g pm2
pm2 start /home/ec2-user/ws_server/server.js --name stryng
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
sudo systemctl enable pm2-ec2-user
sudo systemctl start pm2-ec2-user
```

Check:

```bash
pm2 status
systemctl status pm2-ec2-user
```

---

## 8️⃣ Smoke Tests

```bash
curl -I http://ws.codyx.io              # → 301 Moved Permanently
curl -I https://ws.codyx.io/health      # → 200 OK
wscat -c "wss://ws.codyx.io/ws-codyx/demo?token=some_random_token"   # → Connected
```

---

## ✅ Result

Your endpoint is live and secure:

```
wss://ws.codyx.io/ws-codyx
```

* TLS terminated at Nginx
* Auto-renewing Let’s Encrypt certificates
* Optional token gating (`?token=some_random_token`)
* Liberal but controlled rate & connection limits
* Simple `/health` and `/demotoken` endpoints
* Node or Yjs WebSocket server managed by PM2
* Survives reboots & instance restarts

---

## 🔒 Bonus Hardening Ideas (optional)

* Restrict origins:

  ```nginx
  map $http_origin $ok_origin {
    default 0;
    "~^https?://(www\.)?codyx\.io$" 1;
  }
  if ($ok_origin = 0) { return 403; }
  ```
* Bump `proxy_read_timeout` if you expect idle sessions >5 min.
* Add `fail2ban` to block repeat 403 offenders.

---

**Enjoy your secure, auto-healing Codyx WebSocket endpoint!**
