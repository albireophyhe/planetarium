# Cloudflare Web版の配布

Web版はCloudflare Workers Static Assets向けのVite出力です。アプリ本体、恒星データ、名称、星座線を同一オリジンから配信し、サーバー側の天文APIや秘密値は使いません。
任意の現在気象機能だけは、利用者の明示操作でブラウザーから気象庁の最新アメダス
公開データを取得します。選択座標は送らず、端末内で最寄り局を選びます。実測を
使えない場合だけOpen-Meteoへ直接HTTPS GETを行います。APIキーは配布物へ含めません。

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
- `/`、`/sky`、`/events`と存在しないアプリ内パスがSPAへ戻り、
  `sky`／`events`は対応する主画面を直接表示する。
- HTMLは再検証され、ハッシュ付き`/assets/*`は長期immutable cacheとなる。
- CSP、Permissions-Policy、Referrer-Policy、COOP/CORPが応答に含まれ、
  `connect-src`は同一origin、`https://www.jma.go.jp`、
  `https://api.open-meteo.com`だけを許可する。
- 星検索、地点変更、±1時間、ナイトモード、リセットが動く。
- ブラウザー開発者ツールで、現在気象の明示操作前に外部リクエストがなく、操作後は
  気象庁の固定3 endpointだけを取得する。fallback時だけ固定Open-Meteo forecast
  endpointを追加取得し、座標が小数4桁に丸められている。重大なconsole errorがない。
- 観測mapの品質不良、30分超過、25 km超過、HTTP・形式・サイズ異常で実測を
  誤表示せず、Open-Meteoモデル値へfallbackしたことが画面で分かる。
- 非商用・呼出上限・CC BY 4.0帰属がOpen-Meteoの現行条件と一致する。商用公開時は
  有料customer APIへ切り替える設計・契約・CSPを別途レビューする。

## ロールバック

Cloudflare側のVersion/Deployment履歴から直前の既知良好な版へ戻します。データや計算仕様を更新したリリースでは、コードだけでなく同じ版の同梱JSONを含むデプロイ単位で戻します。
