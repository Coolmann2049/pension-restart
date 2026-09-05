# Pension Restart go-live runbook

Production host: `pension-restart.yashdeep-jha.site`

## 1. Production environment

Create `/var/www/pension-restart/.env` from `.env.example`. At minimum, replace every secret and configure:

```dotenv
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://pension-restart.yashdeep-jha.site
DATABASE_PATH=/var/www/pension-restart/data/pension-restart.db

SESSION_SECRET=<random 64-hex value>
CASE_CODE_SECRET=<different random 64-hex value>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<output of npm run hash-password>

OPENAI_API_KEY=<server-side key>
OPENAI_MODEL=gpt-5.4-mini

VAPI_PRIVATE_API_KEY=<private key>
VAPI_PUBLIC_API_KEY=<browser-safe public key>
VAPI_ASSISTANT_ID=<assistant id>
VAPI_PHONE_NUMBER_ID=<Telnyx number id imported into Vapi>
VAPI_PHONE_NUMBER_DISPLAY=<E.164 number>
VAPI_SERVER_CREDENTIAL_ID=<Vapi server credential id>
VAPI_WEBHOOK_SECRET=<random secret stored in that credential>

META_APP_SECRET=<Meta app secret>
WHATSAPP_VERIFY_TOKEN=<random webhook verification token>
WHATSAPP_ACCESS_TOKEN=<permanent system-user token>
WHATSAPP_PHONE_NUMBER_ID=<Meta phone-number id, not the visible number>
WHATSAPP_BUSINESS_ACCOUNT_ID=<WABA id>
WHATSAPP_API_VERSION=v23.0
WHATSAPP_DISPLAY_NUMBER=<E.164 number>
WHATSAPP_ACCESS_TEMPLATE_NAME=verify_account_2
WHATSAPP_ACCESS_TEMPLATE_LANGUAGE=<exact code shown in WhatsApp Manager>
WHATSAPP_ACCESS_TEMPLATE_ACTION=accessing
WHATSAPP_ACCESS_TEMPLATE_ACCOUNT=Pension Restart
WHATSAPP_ACCESS_TEMPLATE_LINK_TARGET=your pension guidance case
```

Generate each random secret independently with `openssl rand -hex 32`.

## 2. Install and start with PM2

The repository should live at `/var/www/pension-restart`. Install Node.js 20 or newer, then run:

```bash
cd /var/www/pension-restart
npm ci
npm run build
npm test
mkdir -p /var/www/pension-restart/data
chmod 750 /var/www/pension-restart/data
npm install --global pm2
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
curl --fail http://127.0.0.1:3000/health
```

Run PM2 as the same non-root deployment user each time. The application reads `/var/www/pension-restart/.env` itself. Keep `instances: 1`; the SQLite database and in-process live event stream are deliberately single-process.

To survive a reboot, optionally run `pm2 startup`. PM2 prints one `sudo` command tailored to the current user; execute that generated command and then run `pm2 save` again.

Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/pension-restart`, enable it, test Nginx, and reload:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pension-restart
sudo ln -sfn /etc/nginx/sites-available/pension-restart /etc/nginx/sites-enabled/pension-restart
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://pension-restart.yashdeep-jha.site/health
```

The supplied Nginx file expects an existing Let's Encrypt certificate at `/etc/letsencrypt/live/pension-restart.yashdeep-jha.site/`. If it does not exist yet, obtain it with the server's existing Certbot workflow before enabling the TLS block.

## 3. Provider callbacks

Meta WhatsApp callback URL:

```text
https://pension-restart.yashdeep-jha.site/webhooks/whatsapp
```

Use the exact `WHATSAPP_VERIFY_TOKEN` from `.env`, finish verification, and subscribe the WABA to the `messages` field. Message delivery states arrive through that same field.

Vapi server URL:

```text
https://pension-restart.yashdeep-jha.site/webhooks/vapi
```

After the backend is reachable, update the Vapi assistant and number assignment:

```bash
cd /var/www/pension-restart
node scripts/configure-vapi.mjs --dry-run
node scripts/configure-vapi.mjs --apply
```

## 4. End-to-end check

1. Open `/health`; `vapi`, `vapiPhone`, `whatsapp`, and `adminAuth` should be `true`.
2. Send `Namaste` to the WhatsApp number. The bot should return a `PR-123456` case and the first button question.
3. Answer one question and confirm the same case updates in `/admin`.
4. Call the Telnyx/Vapi number, consent to WhatsApp follow-up, finish the intake, and hang up.
5. Confirm that `verify_account_2` arrives with the raw six-digit code and that its delivery state appears in the admin case.
6. Enter either `123456` or `PR-123456` on the website continuation page and confirm it reconnects the same record.

Use `pm2 logs pension-restart` for application errors, `pm2 monit` for process state, and `/var/log/nginx/error.log` for proxy/TLS errors.
