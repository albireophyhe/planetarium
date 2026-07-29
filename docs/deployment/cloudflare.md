# Cloudflare Web版の配布

Web版はCloudflare Workers Static Assets向けのVite出力です。アプリ本体、恒星データ、名称、星座線を同一オリジンから配信し、サーバー側の天文APIや秘密値は使いません。

## 配布前

```sh
ASDF_NODEJS_VERSION=24.18.0 npm ci
ASDF_NODEJS_VERSION=24.18.0 npm run check
```

`npm run check`には、CSPと通信API、初期転送量、`compatibility_date`の未来日、SPA fallback、`wrangler deploy --dry-run`が含まれます。dry-runはCloudflareへのログインを必要としません。

## ローカルの本番相当確認

生成したCloudflare用設定と厳格なCSPを通した起動は、次で確認できます。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run web:build
ASDF_NODEJS_VERSION=24.18.0 npx --no-install wrangler dev \
  --config apps/web/dist/wrangler.json \
  --port 8788 \
  --persist-to /tmp/planetarium-wrangler-state
```

`http://localhost:8788`を開き、静的boot shellが通常画面へ置換されること、
precisionDataとIERS EOPを取得できること、重大なconsole errorがないことを
確認します。永続化先を`dist`の外に置くことで、生成物の監視ループと
配布対象への混入を避けます。確認後は`Ctrl-C`で停止します。

## 配布

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run deploy --workspace=@planetarium/web
```

Wranglerの案内に従い、対象アカウントとWorker名が意図したものか確認してから実行します。このリポジトリにはトークン、アカウントID、`.dev.vars`を保存しません。

## 配布後の確認

- 初回表示が東京・現在時刻で、起動時に位置権限を求めない。
- `/`と存在しないアプリ内パスがSPAへ戻る。
- HTMLは再検証され、ハッシュ付き`/assets/*`は長期immutable cacheとなる。
- CSP、Permissions-Policy、Referrer-Policy、COOP/CORPが応答に含まれる。
- 星検索、地点変更、±1時間、ナイトモード、リセットが動く。
- ブラウザー開発者ツールで外部リクエストと重大なconsole errorがない。

## ロールバック

Cloudflare側のVersion/Deployment履歴から直前の既知良好な版へ戻します。データや計算仕様を更新したリリースでは、コードだけでなく同じ版の同梱JSONを含むデプロイ単位で戻します。
