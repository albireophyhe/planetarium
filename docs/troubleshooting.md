# トラブルシューティング

## Node.jsの版が違う

`.node-version`は`24.18.0`です。asdf環境ではコマンドの先頭へ次を付けます。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run doctor
```

依存関係が不整合なら、lockfileを変更せず`npm ci`で再現してください。

## Webのポート4173を使えない

開発サーバーは誤って別ポートへ移動しないよう`strictPort`です。既存プロセスを特定して終了するか、意図的に`apps/web/vite.config.ts`を変更します。

## Webは開くが星図が空

画面内のエラーを確認し、次を順に実行します。

```sh
npm run data:validate
npm run web:test
npm run web:build
```

位置権限を拒否しても都市と手入力は利用できます。日時は1900-01-01から2100-12-31の範囲にしてください。

## Cloudflareローカル起動が未来日で失敗する

`compatibility_date`はUTCの本日以前である必要があります。`npm run cloudflare:check`が未来日、SPA設定、デプロイdry-runを検査します。

## macOSアプリが開かない

```sh
swift test
./script/build_and_run.sh --verify
codesign --verify --deep --strict --verbose=2 dist/Planetarium.app
```

`--verify`が成功してもウインドウが見えない場合は、Macのロック、別Space、前面アプリを確認します。位置情報を拒否した場合は、地点編集から都市または手入力へ戻れます。

## 表示だけ初期化したい

「表示をリセット」は検索、表示範囲、星座線、星名、ナイトモードを戻し、地点と日時を保持します。macOSで永続化された表示設定も消す場合は、設定の「保存した表示設定を消去」を使います。Web版は正確な位置も表示設定も既定では永続保存しません。
