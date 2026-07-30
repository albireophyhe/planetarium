# リリースチェックリスト

この文書はリリース候補ごとに実行するテンプレートです。機能が実装済みでも、
その候補で再実行していない項目は`[ ]`のままにし、実装状況の記録には
`docs/plans/precision-interaction-plan.md`、
`docs/plans/event-forecast-plan.md`、`docs/progress/iterations.md`を使います。

## ソースとデータ

- [ ] 意図した変更だけが含まれ、秘密値、位置履歴、生成物が追跡対象にない
- [ ] 星表、固有名、星座線、都市、IERS DUT1・極運動、共有200項地球暦、共有フィクスチャのschemaVersionと参照が有効
- [ ] データ出典、取得日、SHA-256、再配布条件を確認
- [ ] 公式`epv00.c`から200 / 1,323項の選定規則、元ファイル・archiveのSHA-256、回転行列を保ったまま共有地球暦を再現できる
- [ ] 精密星表v2、天文モデルv2、対応期間、既知の近似を変更内容と一致させた
- [ ] SOFA由来コードのnoticeと、独立実装・外部データの出典を確認
- [ ] DE442s manifestと41 chunk、イベント候補manifestとchunk、IERS EOP、
  各strict schema、元データhash、coverage、byte長、再配布条件が一致する
- [ ] NASA日食・月食、イベント地球自転、位置角、年端coverage、任意UTC物理sampleの共有fixtureを
  WebとSwiftが同じschemaVersionと意味で読む
- [ ] 恒星位置の誤差予算、イベント境界、平均月縁、連続UTCシナリオ、
  年端coverageを変更内容と一致させ、表示桁を保証精度として説明しない

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
- [ ] Web lint、全テスト、本番ビルド、gzip・raw予算が成功し、最終出力の
  テスト件数と初期／遅延asset実測値をリリース記録へ残す
- [ ] `npm run icons:check`と固定librsvgでの`npm run icons:reproduce`が、Web 180/192/512px PNGとmacOS ICNSをbyte単位で検証する
- [ ] 最大初期JavaScript 600KiB raw、全JavaScript各720KiB rawを満たし、トップレベルと拡張子別の全予算値が正のsafe integerとして検査される
- [ ] Webの2D/3Dが共通のdevice pixel ratio helperを使い、1–2倍へ制限し、非有限値、0、負値を1倍へ戻すテストが成功する
- [ ] Cloudflare設定検査とdeploy dry-run
- [ ] Swiftテスト、アプリバンドル、plist、同梱JSON、署名、起動
- [ ] 将来のTAI−UTCを37秒に固定した8件のSOFA太陽fixtureをWebとSwiftで読み、地心赤道方向とWGS84 topocenterのENU方向を分け、地球暦方向1秒角、距離0.000003 AU、全経路2秒角未満を満たす
- [ ] Web成果物の静的boot shellに目的と`東京・現在時刻を準備中`があり、CSP互換の同一origin `boot-shell.css`がsourceとbyte一致し、inline style/scriptや第三者資産を使わず、React起動後は通常画面へ置換される
- [ ] JavaScript無効時の`noscript`が「表示にはJavaScriptが必要」と同一originの再読み込み導線を示し、hrefが安全に`index.html`へ解決される
- [ ] 本番相当WranglerとCSPでReactが起動してboot shellを置換し、precisionDataとEOPを取得でき、新規console errorがない
- [ ] 生成`.assetsignore`が`wrangler.json`、`.dev.vars`、`.wrangler`を除外し、成果物検査が成功する
- [ ] 初期画面のbase fontと現象／ヘルプ専用supplementがbyte再現でき、
  各機能を開く前に対応する遅延CSS・fontを取得しない
- [ ] 現象を開く前に候補・DE442sを取得しない
- [ ] 恒星位置のSOFA parity、BSC5P／地球暦／EOP誤差予算、WebGL
  Float32変換が回帰上限内で、画面は収録内の1〜数秒角級と
  現行整数うるう秒UTC下のDUT1=0秒fallback上限約13.5秒角を混同せず、
  1972年以前・将来UTC制度、地点、時計、実際の大気を総合上限へ含めない
- [ ] NASA日食・月食、IOTA由来の掩蔽例、物理境界と地平線の独立状態、
  局地／全球分類、掩蔽対象名の整形がWebとSwiftで成功する
- [ ] 接触／最接近位置角がCIRSの天の北0°・東回り規約、共有fixture、
  USNOの日食・月食照合値、退化入力のnil契約を満たす
- [ ] 安全なイベント受信時刻端と1900／2100年のoffset別coverage gapが
  共有fixtureどおりで、1901〜2099年にはgapを返さない
- [ ] macOSの共有resource loadが同時caller、待機側取消、失敗、再試行、
  成功値cacheの契約を満たす

固定したNode.js・同じ端末の性能基準と比較し、公式`epv00.c`を用意して
地球暦のbyte再現も確認します。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run data:build:ephemeris -- --source /path/to/epv00.c --check
ASDF_NODEJS_VERSION=24.18.0 npm run web:bench:precision
ASDF_NODEJS_VERSION=24.18.0 npm run web:bench:precision:soak
./script/benchmark_event_forecasts.sh 2026 1932
```

- [ ] context、1,630星、8,404星の性能に説明できない退行がない
- [ ] 10,000 frame・16,300,000位置が全て有限で、retained heapが32 MiB guard内
- [ ] 代表年と候補最多タイの年で、候補／暦／EOP読込、solver、heap／resident
  memoryに説明できない退行がない
- [ ] A→隣接年→Aのwarm navigationで戻った年のasset再読込が0であり、
  warm時間とcold loadを分けて記録する

## 主要操作

- [ ] 東京・現在時刻が権限要求なしで表示される
- [ ] Web/macOSで1900年は`TAI−UTC=0秒近似`、既知うるう秒範囲後は`将来うるう秒不明・37秒仮定`と具体表示され、通常期間には不要な警告を出さない。macOS Inspectorから仮定の根拠も確認できる
- [ ] 日本語名、英語名、別名検索と星図・一覧・詳細が同期する
- [ ] 都市、手入力、明示的な現在地、拒否後の復旧が動く
- [ ] 日時、DSTエラー、±1時間、「いま」、リセットが正しい
- [ ] 再生・停止、順逆、全速度、reduced-motion、Web非表示／macOS inactive・background停止、1900/2100境界が正しい
- [ ] Web再生中の太陽高度はlive region外にあり、低頻度の計算状態と時刻仮定だけが`aria-live="polite"`で通知される
- [ ] Webの軌跡ON＋再生中に準備中／13点を`status`やlive regionで反復通知せず、checkbox状態、凡例、Canvasの`aria-describedby`は維持される
- [ ] 2D/3D切替、3D回転・拡大縮小・リセット、WebGL失敗時の2D復旧が動く
- [ ] Web 3Dの北・東・南・西・天頂・天底ラベルが回転前後でcameraへ追従し、transformと前面1／背面0.44のopacityが変わり、天頂・天底が14–28px離れて中心で衝突しない
- [ ] Web 3Dの300px以下で回転4方向・reset・zoomが横一段になり、240pxでは各28px、天球中心の遮蔽なし、横overflow 0を確認する
- [ ] 2D/3D/一覧/詳細で時刻、選択、星座線、星名、ナイトモードが同期する
- [ ] 年周視差、太陽光偏向、年周・日周光行差、WGS84楕円体高0 m仮定、IERS DUT1・極運動の観測／予測／公表誤差、収録外0近似、外部暦、大気差の適用範囲を過大評価しない表示になっている
- [ ] UTC日境界とEOP遅延中に新日時だけを先行表示せず、日時・EOP・時刻系・
  恒星・太陽・軌跡・詳細・コピーが同じ整合済みframeを使う。Webの高速再生は
  取得中の最新要求へ集約して停止までstarveせず、初回準備中は精密JSONを出さない。
  収録外または実際の読込失敗が解決した場合だけ新日時の0近似を公開し、
  軌跡中心は同じEOP結果を再利用する
- [ ] 大気差はOFF／標準／手動を区別し、手動の気圧・気温・相対湿度・波長・
  適用下限高度を一括検証する。無効または編集中のdraftで星図・軌跡・詳細・
  コピー座標を変えず、適用後は全経路とJSONの`inputSource`・数値が一致する。
  手動値が標準値と同じ場合も`manual`のままで、再起動後は手動値を復元しない
- [ ] 選択星の人間向け本文とJSONコピーが同じ固定snapshot・再生停止・
  最新操作・完了状態の契約を使い、JSONは
  `planetarium.precision-pointing.full-v1`／`schemaVersion: 1`、
  frame・origin・epoch/equinox・単位・方位規約・大気差を持つ。
  利用不能値は`null`と状態を組み合わせ、実際に適用したEOPの0近似だけを
  `0`と`assumed-zero`で表し、表示桁を精度保証として説明しない
- [ ] 精密導入JSONの共通Draft 2020-12 SchemaがAJV strictでcompileでき、
  Web、macOS、EOP 0近似の3正例を受理し、未知キー・固定値・範囲・状態矛盾を
  壊す11負例を拒否する。CLIがファイル／stdinの不正JSONと不適合を非0で返す
- [ ] 選択星の軌跡は既定OFFで、ON時だけ前後3時間・最大13点を2D/3Dと時刻再生へ同期する
- [ ] 太陽中心の幾何高度、薄明、地平線下、向き、精度制約が画面から理解できる
- [ ] 太陽方向マーカーはWeb/macOSの2D・3Dで同じ太陽状態に同期し、地平線上下・背面・ナイトモード・高コントラストを区別し、恒星選択を奪わない
- [ ] macOS 3Dはdrag・pinch、方向・拡大縮小・resetボタン、`⌃⌘矢印`、`⌘＋ / ⌘−`、`⌘0`、狭幅配置、倍率のVoiceOver値が同じ向きと倍率を更新する
- [ ] macOSで選択星が検索・地平線フィルター・日時変更後も保持され、一覧外の理由と「一覧に表示」導線を示し、軌跡とInspectorが途切れない
- [ ] macOSで星表またはIERSデータの初回読込に失敗しても、アプリを再起動せず明示的に再試行できる
- [ ] Webの240px・390px・200%、キーボード、reduced-motion、高コントラスト
- [ ] Webのdevice pixel ratio 1倍・2倍・4倍で2D/3Dの描画と操作を確認し、4倍では物理解像度を意図どおり2倍へ抑える
- [ ] macOSのメニュー、ショートカット、大きな文字、VoiceOver
- [ ] 「現象」を開くと、観測地点の現地年、種類、地平線下toggle、理由別空状態、
  選択維持、前年／翌年／観測日時の年への移動がWebとmacOSで一致する
- [ ] 観測年では局地最大が観測日時以後の最初の表示対象、全件過去では最新、
  別年では先頭がWebとmacOSで選択される
- [ ] 日食・月食・恒星掩蔽の局地分類、現地／UTC、最大／最接近、接触の
  高度・方位・位置角、星図時刻への移動と復帰が一致する
- [ ] 相対配置は全接触・最大／最接近・物理sample gridで角視野を固定し、
  manual scrubと明示再生の各フレームを指定UTCから再計算する。非表示化と
  reduced-motionで再生が止まり、最大しか確定しない現象は静止図だけになる
- [ ] Webの現象概要再生はwall-clockを基準に、遅れたtimerでは中間frameを
  飛ばして全区間をおおむね24秒で終える。rangeは現在値と開始・終了の
  現地時刻・time zone・UTCを支援技術へ伝える
- [ ] 年次予報LRUがruntime samplerを保持せず、選択sessionの取消、
  stale結果破棄、範囲外拒否、上限付きsample cacheがWebとmacOSで成功する
- [ ] Webは選択・地点・候補範囲・panelのactive状態が変わると古いscene
  sessionを終了し、同じevent IDでも新条件を再準備する。macOSは
  `EventSceneView`ごとのleaseとウインドウ単位の予報Storeにより、一方の
  View／ウインドウの終了が生存中のscene sessionを解除しない
- [ ] 物理境界では発生未確定と中心食分類未確定を区別し、断定できない接触を
  表示せず、地平線状態を別に示す
- [ ] 1900／2100年の収録範囲注意が必要な地点だけに欠落時間を示し、
  その時間を「現象なし」と説明しない
- [ ] 日食の安全注意、恒星掩蔽の参考計算、平均月縁、EOP／ΔT、
  地点精度、全球候補と局地分類の違いへ画面から到達できる
- [ ] 現在地取得は明示操作時だけ精度を優先して一回行い、返された水平精度が
  日食・掩蔽の境界判定と再現情報へ反映される
- [ ] Webのnative filter、listbox、結果件数、完了／時刻変更の一度だけの
  `polite`通知、復帰focus、200%、forced-colorsを確認する
- [ ] macOSのnative Picker、構造化一覧、Announcement、復帰focus、
  大きな文字、VoiceOver読み順を確認する

## 配布

- [ ] Web応答ヘッダー、キャッシュ、SPA fallback、外部通信なしを公開URLで確認
- [ ] macOS公開版はDeveloper ID Application、Hardened Runtime、secure timestampで署名し、不要なentitlementと`get-task-allow`がない
- [ ] `codesign --verify --deep --strict`、Developer ID・runtime flag・`Timestamp`の表示、公証ログ、`stapler validate`、`spctl --assess`が成功する
- [ ] 公証済みticketをstapleした成果物を別ユーザー環境でGatekeeper確認
- [ ] バージョン、変更点、既知の制約、ロールバック対象を記録
