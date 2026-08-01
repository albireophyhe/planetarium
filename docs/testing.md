# 検証方針

## 自動検証

ルートの `npm run check` は、次を順に実行します。

1. 固定したNode.jsツールチェーンの確認
2. Web PNGとmacOS ICNSの原画・生成物hash
3. リポジトリ用Node.jsスクリプトのESLintとshell scriptの構文検査
4. 共有データと参考座標profileのJSON Schema、意味・参照・再現性、
   正例・負例mutation
5. 外部通信API、CSP、dependency install script allowlistの静的検査
6. WebのESLint、Vitest、本番ビルド
7. HTML/CSSから参照される初期アセット768 KiB gzip以下・12ファイル以下、
   最大初期JavaScript 600 KiB raw以下、全JavaScript各720 KiB raw以下と
   配布ファイル別予算
8. PWA成果物、Cloudflareの互換日付とSPA設定、認証なしのdeploy dry-run
9. SwiftPMテスト

リリース候補のテスト件数と実測転送量は、最終差分に対するゲートが完了した
時点で記録する。開発途中の推測値を現行値として固定せず、
`config/web-budgets.json`のトップレベルと拡張子別の上限、初期／遅延assetの
分類を正本にする。全予算値が正のsafe integerとして読めることも検査し、
単一の巨大な起動chunkへ戻る設定退行を失敗にする。
成果物検査はJavaScript無効時の`noscript`文言と同一originの再読み込みhrefも
必須にし、route rootを安全に`index.html`へ解決する。PWAの192/512px PNGと
Apple touch iconは寸法、不透明RGB、manifest用途、source/dist一致を検査する。

フォントのbyte再現は通常のWeb buildにPythonを要求しないため、ルートの
`npm run check`とは分離する。CIとリリース候補ではPython 3.12.3と固定した
`script/requirements-fonts.txt`を使い、`script/subset_fonts.py --check`を
追加で実行する。

参考座標JSONは`shared/schema/star-pointing-profile-v1.schema.json`を
正本とし、AJV Draft 2020-12のstrict modeでcanonical field集合を必須にする。
6件の合成正例とmacOS本番serializer由来の4 fixtureを、構造検査後に
UTCとJD、JD UT1とDUT1、time zoneと現地時刻、EOPの適用値・source・
metadata照合・診断、真空／観測水平座標と大気差状態の意味検査へ通す。
未知キー、固定値、範囲、状態、数値関係、診断flagを壊す28負例は拒否する。
Webは本番serializerをIERS＋標準／手動大気、EOP 0近似＋大気差OFFで直接
Schema検証する。macOSは本番出力と4 fixtureのdeep equalityをSwiftで固定し、
同じfixtureをNode側でもSchema＋意味検証するため、serializer、fixture、
validatorのいずれかだけが変わる退行をCIで検出する。

天文計算v2では、未改変SOFAの公式単体値と、独立Cドライバによる
`fk52h → starpm → pmpx → aberration → precession/nutation`の合成値を
共有fixtureへ固定します。赤経・赤緯の成分差だけでなく、極や天頂でも安定する
単位ベクトル間の球面角距離を主な判定に使います。

IERS EOPは、保存した公式原本のdigest、日次連続性、DUT1と極運動それぞれの
観測／予測境界、うるう秒stepをsmearしないDUT1補間、xp/ypの4点Lagrange補間、
IERS公表誤差の保守的envelope、chunk境界、収録外fallbackを
WebとSwiftの独立decoderで検証します。macOS配布物には統合manifestが列挙する
全chunk（現在は5件）だけが入り、公式原本、lock、checksumが入らないことも
検査します。将来の正規更新でchunkが増えてもmanifest駆動で追従します。

画面統合では、UTC日境界の前後でEOP応答を意図的に遅らせ、要求中の新日時と
直前日時のEOPを混ぜないことを検査します。Webは同一日・日跨ぎ・応答順逆転・
読込失敗・再試行・12 Hz再生の最新要求集約を、日時表示、恒星、太陽、軌跡、
詳細、コピーまで同じ公開frameとして確認します。初回未解決中は精密JSONを
作らず、収録外または実際の読込失敗が解決した時だけ0近似frameを許可します。
macOSは日時設定からEOP、時刻系、全恒星、太陽、13点軌跡、コピーJSONまでが
一回の同期Store更新で切り替わることを統合テストで固定します。
軌跡の中心点は独立に同時刻を再取得せず、公開済みframeのEOPまたは0近似を
再利用し、補助取得の再試行結果が星本体と中心マーカーを分離しないことも
両版で検査します。中心と前後12点のEOP適用状態を別に記録し、収録外または
読込失敗で0近似した点だけを凡例とCanvas説明へ限定表示します。

極運動行列は未改変SOFA `sp00` / `pom00`の公式参照値、符号・軸ごとの
変位、無効化、xp/yp=0 fallback、GAST→TIRS→ITRS→ENU→日周光行差→大気差
という合成順を両実装で固定します。日周・半日周潮汐補正は未適用として
metadataへ残します。

日周光行差は、未改変SOFA Cの`pvtob → apio → atioq`から補正だけを
分離した7ケースの共有fixtureをWebとSwiftで読みます。WGS84自転速度係数、
東向きENU補正、単位長、球面角距離を検証し、既定の楕円体高0 m警告、
外部標高、明示的な無効化、地球回転後・大気差前という合成順も固定します。

大気差設定はOFF／標準／手動を別状態として検査する。手動の5項目は
空欄、非有限値、範囲外、物理的に不成立な組合せを日本語エラーで拒否し、
編集途中と失敗時には適用済み設定を変えない。成功時だけ一つの設定として
星図、選択星軌跡、詳細、本文／JSONコピーへ切り替え、標準と同値の手動入力も
`inputSource: manual`を保持する。手動値がセッション外へ永続化されないことも
両クライアントの保存契約で確認する。

現在気象は利用者の明示操作前に通信しない。気象庁transportは最新時刻、観測所表、
全国観測mapの固定URLへの匿名GETだけを許可し、選択地点の緯度・経度を送らない。
観測時刻の厳格な解析、観測値と品質フラグのpair、`pressure`だけの採用、最寄り局の
Haversine距離、30分・25 km境界を注入時計とfixtureで両版に固定する。
欠損、品質不良、古い観測、遠距離、HTTP、timeout、取消、JSON、content type・サイズ
異常では実測と表示しない。

その場合だけOpen-Meteo transportを使い、`api.open-meteo.com/v1/forecast`への
匿名GETへ小数4桁に丸めた緯度・経度と固定の`temperature_2m`、
`relative_humidity_2m`、`surface_pressure`以外の利用者情報を送らない。成功応答は
unit、有限値、範囲、時刻を検証し、既存の波長と最低適用高度を保持した一つの手動設定
として原子的に適用する。両経路とも失敗時は適用済み設定を変えず再試行できることを
両版で検査する。

太陽中心の幾何高度は、未改変SOFA Cの
`epv00 → ab → pnm06a / c2i06a → pvtob → apio13 → atioq`で作った
8ケースと比較します。共有200項VSOP2000地球暦の太陽中心→地球位置、
地心の真赤道・真分点方向、WGS84 topocenterのENU方向を同じfixtureから
検証し、地球暦方向は1秒角、距離は
`0.000003 AU`、全パイプラインの球面角残差は2秒角未満に固定します。
SOFA側は`epv00`の全1,323項と太陽系重心速度、アプリ側は200 / 1,323項と
その解析微分速度、IAU 2000Bを使うため完全一致とはしません。
共有係数は`script/build_earth_ephemeris.mjs`が公式`epv00.c`の
SHA-256を確認して決定論的に生成します。1900-01-01 00:00〜
2100-12-31 18:00の6時間刻み293,656時点では、光行差前の太陽方向差が最大0.8324427秒角、
光行差後が最大0.8413076秒角でした。
見かけ赤経・赤緯は地心方向のまま、水平位置はSOFA `pvtob`とアプリの
WGS84 ITRS地点減算の双方で太陽の日周視差を含めます。標高4,205 m・
地平線付近のケースで高さ経路も固定します。薄明区分には大気差を混ぜず、
0°、−6°、−12°、−18°の太陽中心高度を使います。

### 恒星位置の誤差予算

恒星位置は同じ入力に対するSOFA parityだけでなく、BSC5Pの格納分解能、
共有200項地球暦、現在日のIERS EOP公表誤差、EOP収録外fallback、描画までの
数値変換を別々に検査する。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm exec --workspace=@planetarium/web -- \
  vitest run \
  src/domain/precision/starPositionAccuracy.test.ts \
  src/features/sky/renderingAccuracy.test.ts

swift test --filter PrecisionAstronomyTests
```

自動検査の小さいparity値を製品全体の保証値とは扱わない。画面ではEOP収録内の
星表・真空計算部分についての「おおむね1〜数秒角級・サブ秒角保証なし」と、
収録外または読込失敗時のDUT1=0秒・xp/yp=0近似を確認する。13.5秒角は
現行の整数うるう秒UTCが維持される期間に限るDUT1の条件付き上限と表示し、
1972年以前・将来UTC制度、地点、時計、実際の大気を含む総合上限にしない。
根拠と再現値は`docs/accuracy/star-position-validation.md`を正本にする。

### 食・掩蔽予報の正しさ

イベント層では次を別々の回帰契約として検査する。

- DE442sと候補索引のmanifest、chunk hash、byte長、coverage、strict schema
- NASAの日食・月食fixtureと、IOTA由来の恒星掩蔽掲載例
- EOP範囲内と範囲外の時刻系、連続UTCシナリオ、境界の工学的envelope
- 物理境界の不確実性と地平線可視性を独立に返す状態契約
- CIRS接平面で天の北0°・東回りとする接触／最接近位置角、退化入力、
  USNOの日食・月食照合例
- 600秒の光行時間reserveを含む安全な受信時刻範囲と、1900／2100年の
  現地年coverage gapを固定するWeb／Swift共有fixture
- BSC5Pの符号列を、固有名を保ちながらバイエル符号へ整形する掩蔽対象名

最終ゲートでは個別テスト名の件数を手書きせず、`npm run check`と
`swift test -c release`の実出力をリリース記録へ残す。

## Webの性能検証

通常の品質ゲートとは分け、固定したNode.js 24.18で次を実行します。

```sh
npm run web:bench:precision
npm run web:bench:precision:soak
```

前者は200項地球暦を含むcontext生成、UI対象1,630星、全8,404星を
同じfixtureで比較します。後者は`--expose-gc`付きで1900〜2100年の
10,000 frame、16,300,000位置を走査し、全座標の有限性と32 MiBの
retained-heap guardを検証します。所要時間と絶対速度は実行環境に依存するため、
回帰判断では同じNode.js・同じ端末・同じ星表件数を使います。

## 食・掩蔽予報の軽量性監査

年単位の候補読込と東京での全局地計算は、通常の品質ゲートから分離した
次のコマンドでWebとmacOSを同条件で測定します。

```sh
# 代表年2026（108候補）と、現行候補表で最多タイの1932（125候補）
npm run events:bench

# 任意の単年だけを再測定
npm run events:bench -- 2026
```

スクリプトはWebを固定Node.js 24.18の`--expose-gc`付きVitest worker、
macOSをSwiftPMのreleaseテストとして、それぞれ新しいprocessで実行します。
`PLANETARIUM_EVENT_BENCHMARK_YEAR`を直接指定して個別にも実行できます。

```sh
ASDF_NODEJS_VERSION=24.18.0 \
  PLANETARIUM_EVENT_BENCHMARK_YEAR=2026 \
  npm run web:bench:events

PLANETARIUM_EVENT_BENCHMARK_YEAR=2026 \
  swift test -c release \
    --filter EventForecastPerformanceTests/testAnnualTokyoForecastColdLoad
```

出力JSONの`candidateLoadMilliseconds`と
`forecastCalculationMilliseconds`を分けて記録し、候補、DE442s、IERS EOPの
実読込chunk名・回数・raw byte数も確認します。Swift側はmanifestに記録された
gzip byte数も併記します。Webの`peakHeapUsedBytes`・`peakRssBytes`には
Vitest worker、Swiftの`peakResidentBytes`にはXCTest runnerの基礎量が
含まれるため、異なるruntime間の絶対値比較ではなく、同じ端末・toolchainでの
差分と回帰に使います。assetはローカルから読むため、Cloudflareや回線の
遅延は測定対象外です。

同じコマンドは代表年A→隣接年B→Aのwarm asset navigationも出力する。
戻ったAで`returnAssetReadDelta`が0であることを確認し、解計算時間と
asset再読込を混同しない。macOSでは、候補、星表、DE442s、EOPのcold loadを
`SharedAsyncResource`で一つのin-flight taskへ集約し、次も単体テストする。

- 同時callerが一度だけloadする
- 一つの待機側の取消が共有loadを取消さない
- 成功値を次の年切替で再利用する
- 失敗または共有load自身の取消後はentryを除き、次の明示操作で再試行できる

## Webの手動確認

- 初期表示: 権限要求なしで東京・現在時刻の星図が見える
- 探索: 日本語名、英語名、別名で検索し、一覧と星図の選択が同期する
- 時刻: −1時間、＋1時間、直接入力、「いま」が同じ時刻表示へ反映される
- 時間再生: 開始・停止、順逆、全速度、期間端、タブ非表示、reduced-motionが正しい
- 3D: 2D/3D切替、ドラッグ・キーボード・拡大縮小・リセット、選択同期、WebGL失敗時の復旧
- 軌跡: 既定OFF、選択星だけの前後3時間・13点、2D地平線clip、3D減光、時刻追従
- レイヤー: 星座線、星名、薄明背景、ナイトモード、大気差が2D/3Dと説明へ一貫して反映される
- 精度表示: 年周視差の適用可否、年周・日周光行差、WGS84楕円体高0 m仮定、近似暦、IERS DUT1・極運動の観測／予測／公表誤差と収録外0近似、視線速度0仮定、未適用補正を過大評価しない
- 地点: 都市、手入力、明示操作の現在地が使え、拒否後も都市へ戻れる
- 意味: 太陽中心の幾何高度、薄明区分と、幾何学的地平線上が肉眼可視を保証しない説明が見える
- リセット: 表示だけを戻し、地点と日時は保持する
- アクセシビリティ: キーボード、画面遷移後のfocus、DOM一覧、200%ズーム、
  320／390px幅、長いHelpの本文focus・keyboard scroll・Disclosure、reduced-motion
- エラー: Canvas不可、位置拒否、無効な座標・日時で白紙にならない
- プライバシー: 起動・地点選択・大気設定を開いただけでは通信せず、現在気象の
  明示操作時も気象庁には選択座標を送らない。Open-Meteo fallback時だけ丸めた座標を
  送る。実測／モデル表示、送信前説明、両出典、失敗時の保持を確認する
- 現象: 現地年、種類、地平線下toggle、理由別空状態、局地／全球分類、
  現地・UTC、接触／最接近の高度・方位・位置角、日時移動と復帰が一貫する
- 現象の境界: 発生または中心食分類の不確実性と、地平線上／下が別に見え、
  断定できない接触を表示しない
- 現象の年端: 欠落がある1900／2100年だけに収録範囲注意を示し、
  1901〜2099年へ誤って表示しない
- 現象のアクセシビリティ: native select、listbox矢印移動、結果件数、
  一度だけの完了／時刻変更通知、復帰focus、200%、forced-colorsを確認する
- 遅延読込: 「現象」「ヘルプ」を開く前は対応するCSSとsupplement fontを取得せず、
  開いた後だけ必要な同一origin assetを取得する。候補とDE442sは「現象」を
  開いた後だけ取得する

## macOSの手動確認

- `script/build_and_run.sh`から`release`構成の`.app`として起動する
- アプリウインドウが前面に現れ、閉じた後にメニューから再表示できる
- ツールバー、一覧、Canvas、詳細、地点、日時が大きな文字でも操作できる
- 2D/3D、天球drag、矢印操作、時間再生、選択、星座線、星名が同じStoreに同期する
- IERS DUT1・極運動の観測／予測／公表誤差と収録外・検証失敗の0近似が状態とInspectorに一致する
- 日周光行差の適用とWGS84楕円体高0 m仮定が状態とInspectorに一致する
- 動きを減らす設定では自動再生を停止し、静止操作を残す
- メニューとキーボードショートカットが画面上の操作と一致する
- 「現在地」を選ぶまで位置許諾を要求しない
- 明示的な現在地取得は精度を優先した一回取得とし、OSが返す水平精度を
  Web／macOSの局地予報へ伝える
- 位置拒否後も都市と手入力が使える
- ナイトモードを含め、選択やエラーの意味を色だけに依存しない
- 現象のnative Picker、地平線下toggle、年移動、一覧、詳細をキーボードと
  VoiceOverで操作でき、現地時刻とUTCの両方を確認できる
- 計算・絞り込み結果、時刻変更、復帰を一度だけAnnouncementし、復帰後は
  最大／最接近操作へfocusが戻る
- 1900／2100年の収録範囲注意、物理境界の不確実性、地平線状態が
  別々のアクセシブルな説明として取得できる
- 観測年は局地最大が観測日時以後となる最初の表示対象を選び、全件過去では
  最新、別年では先頭へ戻る

## 視覚比較

採用コンセプトのネイティブサイズを基準に、デスクトップとモバイルのスクリーンショットを比較します。最低でも、星図の比率、ツールバー密度、一覧と詳細の階層、時刻操作、狭い幅での順序を確認し、意図した差異を改善ログへ記録します。
