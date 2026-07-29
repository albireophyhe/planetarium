# リリースチェックリスト

この文書はリリース候補ごとに実行するテンプレートです。機能が実装済みでも、
その候補で再実行していない項目は`[ ]`のままにし、実装状況の記録には
`docs/plans/precision-interaction-plan.md`と`docs/progress/iterations.md`を使います。

## ソースとデータ

- [ ] 意図した変更だけが含まれ、秘密値、位置履歴、生成物が追跡対象にない
- [ ] 星表、固有名、星座線、都市、IERS DUT1・極運動、共有100項地球暦、共有フィクスチャのschemaVersionと参照が有効
- [ ] データ出典、取得日、SHA-256、再配布条件を確認
- [ ] 公式`epv00.c`から100 / 1,323項の選定規則、元ファイル・archiveのSHA-256、回転行列を保ったまま共有地球暦を再現できる
- [ ] 精密星表v2、天文モデルv2、対応期間、既知の近似を変更内容と一致させた
- [ ] SOFA由来コードのnoticeと、独立実装・外部データの出典を確認

## 自動ゲート

```sh
ASDF_NODEJS_VERSION=24.18.0 npm ci
ASDF_PYTHON_VERSION=3.12.3 python3 --version
ASDF_PYTHON_VERSION=3.12.3 python3 -m venv .venv-fonts
.venv-fonts/bin/python -m pip install --requirement script/requirements-fonts.txt
.venv-fonts/bin/python script/subset_fonts.py --check
ASDF_NODEJS_VERSION=24.18.0 npm run icons:reproduce
ASDF_NODEJS_VERSION=24.18.0 npm run check
./script/build_and_run.sh --verify
git status --short
git diff --check
git diff --cached --check
```

`git diff --check`は未追跡ファイルを検査しません。初回commit前は
`git status --short`で全対象を確認し、意図したbaseline commitを作成した後に
追跡済み・staged双方のcheckを再実行します。

- [ ] 固定Python 3.12.3と固定requirementsで、同梱WOFF2をbyte単位に再現できる
- [ ] `npm ci`が未審査install scriptをhard failし、IBM Plex telemetryを拒否し、固定版の`esbuild`・`workerd`・`fsevents`だけを許可する
- [ ] Web lint、316テスト、本番ビルド、gzip・raw予算。現行基準の初期12ファイル730.5KiB gzip、最大初期`catalog-v1` 523.0KiB rawから説明できない増加がない
- [ ] `npm run icons:check`と固定librsvgでの`npm run icons:reproduce`が、Web 180/192/512px PNGとmacOS ICNSをbyte単位で検証する
- [ ] 最大初期JavaScript 600KiB raw、全JavaScript各720KiB rawを満たし、トップレベルと拡張子別の全予算値が正のsafe integerとして検査される
- [ ] Webの2D/3Dが共通のdevice pixel ratio helperを使い、1–2倍へ制限し、非有限値、0、負値を1倍へ戻すテストが成功する
- [ ] Cloudflare設定検査とdeploy dry-run
- [ ] Swiftテスト、アプリバンドル、plist、同梱JSON、署名、起動
- [ ] 将来のTAI−UTCを37秒に固定した8件のSOFA太陽fixtureをWebとSwiftで読み、地心赤道方向とWGS84 topocenterのENU方向を分け、地球暦方向3秒角、距離0.00001 AU、全経路5秒角未満を満たす
- [ ] Web成果物の静的boot shellに目的と`東京・現在時刻を準備中`があり、CSP互換の同一origin `boot-shell.css`がsourceとbyte一致し、inline style/scriptや第三者資産を使わず、React起動後は通常画面へ置換される
- [ ] JavaScript無効時の`noscript`が「表示にはJavaScriptが必要」と同一originの再読み込み導線を示し、hrefが安全に`index.html`へ解決される
- [ ] 本番相当WranglerとCSPでReactが起動してboot shellを置換し、precisionDataとEOPを取得でき、新規console errorがない
- [ ] 生成`.assetsignore`が`wrangler.json`、`.dev.vars`、`.wrangler`を除外し、成果物検査が成功する

固定したNode.js・同じ端末の性能基準と比較し、公式`epv00.c`を用意して
地球暦のbyte再現も確認します。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run data:build:ephemeris -- --source /path/to/epv00.c --check
ASDF_NODEJS_VERSION=24.18.0 npm run web:bench:precision
ASDF_NODEJS_VERSION=24.18.0 npm run web:bench:precision:soak
```

- [ ] context、1,630星、8,404星の性能に説明できない退行がない
- [ ] 10,000 frame・16,300,000位置が全て有限で、retained heapが32 MiB guard内

## 主要操作

- [ ] 東京・現在時刻が権限要求なしで表示される
- [ ] Web/macOSで1900年は`TAI−UTC=0秒近似`、既知うるう秒範囲後は`将来うるう秒不明・37秒仮定`と具体表示され、通常期間には不要な警告を出さない。macOS Inspectorから仮定の根拠も確認できる
- [ ] 日本語名、英語名、別名検索と星図・一覧・詳細が同期する
- [ ] 都市、手入力、明示的な現在地、拒否後の復旧が動く
- [ ] 日時、DSTエラー、±1時間、「いま」、リセットが正しい
- [ ] 再生・停止、順逆、全速度、reduced-motion、非表示停止、1900/2100境界が正しい
- [ ] Web再生中の太陽高度はlive region外にあり、低頻度の計算状態と時刻仮定だけが`aria-live="polite"`で通知される
- [ ] Webの軌跡ON＋再生中に準備中／13点を`status`やlive regionで反復通知せず、checkbox状態、凡例、Canvasの`aria-describedby`は維持される
- [ ] 2D/3D切替、3D回転・拡大縮小・リセット、WebGL失敗時の2D復旧が動く
- [ ] Web 3Dの北・東・南・西・天頂・天底ラベルが回転前後でcameraへ追従し、transformと前面1／背面0.44のopacityが変わり、天頂・天底が14–28px離れて中心で衝突しない
- [ ] Web 3Dの300px以下で回転4方向・reset・zoomが横一段になり、240pxでは各28px、天球中心の遮蔽なし、横overflow 0を確認する
- [ ] 2D/3D/一覧/詳細で時刻、選択、星座線、星名、ナイトモードが同期する
- [ ] 年周視差、太陽光偏向、年周・日周光行差、WGS84楕円体高0 m仮定、IERS DUT1・極運動の観測／予測／公表誤差、収録外0近似、外部暦、大気差の適用範囲を過大評価しない表示になっている
- [ ] 選択星の軌跡は既定OFFで、ON時だけ前後3時間・最大13点を2D/3Dと時刻再生へ同期する
- [ ] 太陽中心の幾何高度、薄明、地平線下、向き、精度制約が画面から理解できる
- [ ] 太陽方向マーカーはWeb/macOSの2D・3Dで同じ太陽状態に同期し、地平線上下・背面・ナイトモード・高コントラストを区別し、恒星選択を奪わない
- [ ] macOS 3Dはdrag・pinch、方向・拡大縮小・resetボタン、`⌃⌘矢印`、`⌘＋ / ⌘−`、`⌘0`、狭幅配置、倍率のVoiceOver値が同じ向きと倍率を更新する
- [ ] macOSで選択星が検索・地平線フィルター・日時変更後も保持され、一覧外の理由と「一覧に表示」導線を示し、軌跡とInspectorが途切れない
- [ ] macOSで星表またはIERSデータの初回読込に失敗しても、アプリを再起動せず明示的に再試行できる
- [ ] Webの240px・390px・200%、キーボード、reduced-motion、高コントラスト
- [ ] Webのdevice pixel ratio 1倍・2倍・4倍で2D/3Dの描画と操作を確認し、4倍では物理解像度を意図どおり2倍へ抑える
- [ ] macOSのメニュー、ショートカット、大きな文字、VoiceOver

## 配布

- [ ] Web応答ヘッダー、キャッシュ、SPA fallback、外部通信なしを公開URLで確認
- [ ] macOS公開版はDeveloper ID Application、Hardened Runtime、secure timestampで署名し、不要なentitlementと`get-task-allow`がない
- [ ] `codesign --verify --deep --strict`、Developer ID・runtime flag・`Timestamp`の表示、公証ログ、`stapler validate`、`spctl --assess`が成功する
- [ ] 公証済みticketをstapleした成果物を別ユーザー環境でGatekeeper確認
- [ ] バージョン、変更点、既知の制約、ロールバック対象を記録
