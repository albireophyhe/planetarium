# Planetarium

指定した地点と日時の空を、迷わず眺められる小さなプラネタリウムです。

このリポジトリでは、同じ星表と同じ天文計算仕様を使う二つのクライアントを開発します。

- macOS ネイティブ版: SwiftUI / SwiftPM
- Web版: React / TypeScript / Vite。Cloudflare Workers Static Assets にデプロイ可能

## 現在の状態

恒星中心のMVPと初回50回の改善ループ、精度・時間再生・3D天球の
第2改善フェーズを完了し、現在は日食・月食・明るい恒星の月掩蔽を
端末内で予報するフェーズを進めています。恒星8,404件、固有名49件、
主要星座10件を同梱し、WebとmacOSで同じ計算仕様と検証値を使います。
精密モデルv2（年周視差・太陽重力光偏向・年周/日周光行差・IERS DUT1／極運動）、
順逆・速度付きの時間再生、任意の3D天球、標準／手動入力の光学大気差、
選択星の前後3時間の軌跡、同じ地球姿勢を使う太陽高度と薄明、
同梱IERS地球姿勢データ、日本語タイポグラフィを
実装済みです。食・掩蔽の詳細では、接触・最大／最接近の相対配置に加え、
確定接触区間を任意UTCで物理再計算する固定角視野のscrub／概要再生を
WebとmacOSで提供し、画面座標は補間しません。Webの概要再生はwall-clockを
基準に中間frameを必要に応じて飛ばし、timer callbackの遅れをframe数へ
累積させず、全区間を約24秒で進める設計です。macOSでは現象sessionを
ウインドウ単位かつView所有leaseで
管理し、一方の画面を閉じても別画面の計算を誤って終了しません。太陽位置と既定の
地球位置・速度は、共有する
VSOP2000由来200項地球暦を使い、1900〜2100年の約29万時点走査と
未改変SOFAの8ケースに対して全経路2秒角未満を契約にしています。太陽の
水平位置にはWGS84観測地点による日周視差も反映し、見かけ赤経・赤緯は
比較可能な地心値として保持します。

選択星の導入用readoutは、読みやすい本文に加えて
`planetarium.precision-pointing.full-v1`／`schemaVersion: 1`のJSONを
WebとmacOSから明示的にコピーできます。JSONは座標frame・原点・単位、
UTC/UT1/TT、EOP、大気差と未適用補正を伴う転記・再現用profileであり、
表示桁や機械可読化によって位置精度が向上または保証されるものではありません。
大気差は既定OFFで、標準大気または気圧・気温・相対湿度・波長・
適用下限高度を一括検証した手動値を選べます。手動値はセッション中だけ保持し、
真空中の幾何座標を常に別値として残します。

- [改訂実装計画（正本）](docs/plans/revised-plan.md)
- [ユーザーストーリーと優先度](docs/product/user-stories.md)
- [精度・時間・3Dフェーズ実装計画](docs/plans/precision-interaction-plan.md)
- [精度・時間・3Dフェーズのユーザーストーリー](docs/product/user-stories-phase2.md)
- [食・掩蔽予報フェーズ実装計画](docs/plans/event-forecast-plan.md)
- [食・掩蔽予報フェーズのユーザーストーリー](docs/product/user-stories-events.md)
- [食・掩蔽の共有暦に関する技術判断](docs/decisions/0002-local-event-ephemeris.md)
- [食・掩蔽予報の独立精度照合](docs/accuracy/event-forecast-validation.md)
- [恒星位置の精度検証と誤差予算](docs/accuracy/star-position-validation.md)
- [食・掩蔽候補索引の再現方法](docs/data/event-candidates.md)
- [天文計算モデル](docs/astronomy-model.md)
- [天文計算モデル v2](docs/astronomy-model-v2.md)
- [自動・手動検証方針](docs/testing.md)
- [アクセシビリティ](docs/accessibility.md)
- [プライバシー](docs/privacy.md)
- [Cloudflare配布手順](docs/deployment/cloudflare.md)
- [macOSビルド・配布準備](docs/deployment/macos.md)
- [トラブルシューティング](docs/troubleshooting.md)
- [リリースチェックリスト](docs/release-checklist.md)
- [データの出典と再配布上の注意](shared/catalog/README.md)
- [IERS地球姿勢データの出典・再現・補間契約](shared/eop/README.md)
- [共有200項地球暦の再現・精度契約](shared/ephemeris/README.md)
- [初期実装計画（置換済み）](docs/plans/initial-plan.md)
- [プラットフォーム構成の判断](docs/decisions/0001-cross-platform-architecture.md)
- [改善ログ](docs/progress/iterations.md)

## 開発原則

1. 最初の数秒で星空を表示し、学習コストを小さくする。
2. 位置情報は端末内で扱い、手入力でも全機能を使えるようにする。
3. 星の位置・時刻・方角は説明可能な計算から生成し、両版で同じ検証値を通す。
4. 星表と計算を同梱し、外部天文APIをMVPの必須条件にしない。
5. macOSではネイティブのメニュー・キーボード・ウインドウ操作を尊重し、Webではレスポンシブ表示とアクセシビリティを優先する。

## 想定ツールチェーン

- macOS 14以上、Swift 6
- Node.js 24.18.0
- npm 11.16.0

## セットアップ

```sh
ASDF_NODEJS_VERSION=24.18.0 npm ci
ASDF_NODEJS_VERSION=24.18.0 npm run data:validate
```

asdfを使わない場合も、`.node-version`と同じNode.jsを利用してください。
`npm ci`は未審査のdependency install scriptを拒否します。依存追加で必要に
なった場合は、通信と副作用を確認した完全なpackage名・versionだけを
`allowScripts`へ追加します。

食・掩蔽候補索引を固定したJPL DE442sから再生成・照合する場合は、
配布元kernelを明示します。通常のビルドや実行時にkernel本体は不要です。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run data:build:events -- \
  --source /path/to/de442s.bsp
ASDF_NODEJS_VERSION=24.18.0 npm run data:check:events -- \
  --source /path/to/de442s.bsp
```

## Web版

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run web:dev
```

開発サーバーは `http://localhost:4173` です。Cloudflare用の本番ビルドとデプロイは次の通りです。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run web:build
ASDF_NODEJS_VERSION=24.18.0 npm run cloudflare:check
ASDF_NODEJS_VERSION=24.18.0 npm run deploy --workspace=@planetarium/web
```

デプロイにはCloudflareのログインとアカウント側の権限が別途必要です。

### アプリアイコンの検証

Webの180/192/512px PNGとmacOSのICNSは同じ`favicon.svg`を原画にします。
通常の品質ゲートでは固定hashを検査し、原画変更時はlibrsvg 2.62.3で
byte単位の再現まで確認します。

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run icons:check
ASDF_NODEJS_VERSION=24.18.0 npm run icons:reproduce
```

### Webフォントの再生成

Web版はIBM Plex Sans JP 3.0.0のRegular/SemiBoldを、初期UI・同梱星表用のbase、天文現象用のevent supplement、ヘルプ用のhelp supplementへ分けたWOFF2として配布します。2つのsupplementは各機能の遅延CSSから読み込まれるため、初期転送には含まれません。通常のビルドにはPythonは不要です。UIコピー、星表・現象候補の表示名、ヘルプ本文を変更した場合だけ、Python 3.12.3の隔離環境で再生成します。

```sh
ASDF_PYTHON_VERSION=3.12.3 python3 --version
ASDF_PYTHON_VERSION=3.12.3 python3 -m venv .venv-fonts
.venv-fonts/bin/python -m pip install --requirement script/requirements-fonts.txt
.venv-fonts/bin/python script/subset_fonts.py
.venv-fonts/bin/python script/subset_fonts.py --check
ASDF_NODEJS_VERSION=24.18.0 npm run web:build
ASDF_NODEJS_VERSION=24.18.0 npm run web:budget
```

`--check`はリポジトリを変更せず、同じ入力から一時生成したバイト列と6個の配布WOFF2を比較します。同時に、baseと各supplementで重複しない文字カバレッジ、3つのCSS内の生成済み`@font-face`と`unicode-range`、Regular 400／SemiBold 600、OFLのライセンスメタデータ、Reserved Font Nameの改名、個別ファイル予算も検証します。event/helpは単独で開けるため、両方だけで使う文字は各supplementへ意図的に収録します。基準環境と手元のPythonまたはFontToolsの版が異なる場合は明示的に失敗します。

CIも同じ固定環境で`--check`を実行します。ライセンスと第三者由来物は[Third-party notices](THIRD_PARTY_NOTICES.md)にまとめています。Web配布物にはOFL 1.1全文も同梱します。

## macOS版

```sh
./script/build_and_run.sh
```

SwiftPMの単体テストだけを実行する場合は `swift test`、アプリバンドルの
構築・署名と起動プロセスまで検証する場合は
`./script/build_and_run.sh --verify` を使います。

## 全体検証

```sh
ASDF_NODEJS_VERSION=24.18.0 npm run check
```

このコマンドはアプリアイコンのhash、データ整合性、外部通信APIの静的検査、
Webのlint・テスト・本番ビルド・転送量予算、Cloudflareデプロイのdry-run、
Swiftテストを確認します。

## 表示の意味

画面の「地平線上」は幾何学的な高度が0度以上という意味です。実際の肉眼可視性は、昼光、薄明、天候、光害、地形、建物、視力にも左右されます。本アプリは航法、測地、望遠鏡の自動指向には使用できません。

恒星位置の式は収録した共有SOFA検証fixtureで最大数ミリ秒角以内に一致しますが、BSC5P星表の
格納分解能と品質注記、既定の短縮地球暦、時刻・地点・大気が実用精度を制限します。
IERS EOP収録内の現在付近では、BSC5Pの格納分解能から見た真空中の通常目安を
概ね1〜数秒角級とします。これは全恒星の実測精度を保証する値ではなく、
大気差ON時の表示高度も別です。EOP収録外ではDUT1=0秒・xp/yp=0近似を使います。
時角の最大約13.5秒角は現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安で、
xp/yp=0による方向差も同梱履歴では最大約0.6秒角です。1972年以前は
TAI−UTC=0秒、将来は既知最後の37秒を仮定するUTC近似を含みます。詳細は
[`docs/accuracy/star-position-validation.md`](docs/accuracy/star-position-validation.md)
を参照してください。
