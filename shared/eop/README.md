# IERS Bulletin A Earth orientation

`iers-finals2000a-eop.v1.json`と`eop/*.v1.json`は、IERS Rapid
Service/Prediction Center（USNO）が公開する`finals2000A.all`から、
UT1−UTC（DUT1）と極運動`xp` / `yp`をオフライン利用向けに一体で正規化した
canonical EOP v1生成物です。

既存アプリとの移行互換性のため、`iers-finals2000a-dut1.v1.json`と
`dut1/*.v1.json`も同じ原本から同時に再生成します。現行Web/macOS runtimeは
統合EOPを使い、互換DUT1生成物は旧API・再現性検証だけのために保持します。

## 公式出典と再配布

- 原本: <https://maia.usno.navy.mil/ser7/finals2000A.all>
- 固定幅format: <https://maia.usno.navy.mil/ser7/readme.finals2000A>
- 公式SHA-512一覧:
  <https://maia.usno.navy.mil/ser7/checksums.sha512>
- IERS product metadata:
  <https://datacenter.iers.org/versionMetadata.php?filename=latestVersionMeta%2F9_FINALS.ALL_IAU2000_V2013_019.txt>
- 配布条件の掲示:
  <https://maia.usno.navy.mil/products/daily>

USNOの配布ページは
“Distribution Statement A. Approved for public release: distribution
unlimited.”と明記しています。これはオープンソースライセンス名ではないため、
公式原本、format、checksum、取得情報、attributionを一緒に保持します。

同梱スナップショットは2026-07-30T23:12:41.229Z取得、原本の
`Last-Modified`は2026-07-30T17:43:11Zです。

- 原本SHA-256:
  `4b828090fc94114168014b61439fa5e6ec0bdfda518075a32baffea90110954d`
- USNO公式SHA-512:
  `ab5d92505408dbe5f7900dcc1068c445dcc1227d2078c9623fd2c5a6804adefde59d3c564d08c8df150103f0a41938559774980e734ddfb9fca3fcc42f6506d8`

## 原本列と収録範囲

公式の1始まり固定幅定義から次の列を独立に読みます。

| 原本列 | 内容 | 単位 |
| --- | --- | --- |
| 8–15 | fractional MJD UTC。収録値は日次00:00 UTC | day |
| 17 | Bulletin A極運動の`I` / `P` flag | — |
| 19–27 / 28–36 | `xp` / `xp` error | arcsecond |
| 38–46 / 47–55 | `yp` / `yp` error | arcsecond |
| 58 | Bulletin A UT1の`I` / `P` flag | — |
| 59–68 / 69–78 | UT1−UTC / UT1−UTC error | second |

PMとUT1のflagは現在のスナップショットでは一致しますが、公式formatでは
独立した列です。chunkも`polarMotionQualityRanges`と
`dut1QualityRanges`を別々に保持し、一方から他方を推定しません。`I`は公式の
“IERS” flag、`P`はpredictionです。

正規化範囲はMJD 41684–61624（1973-01-02 00:00 UTCから
2027-08-07 00:00 UTCまでのsample）の19,941日です。PM、UT1とも
`I=19,568`、`P=373`で、IERS値の最終sampleはMJD 61251、予測開始sampleは
MJD 61252です。原本19,991行の末尾50行はPMとUT1がともに欠測しており、
observable別の`missingTailRows`としてmanifestとlockへ保存します。

原本の列名は単に`error`であり、信頼水準や共分散を規定していません。
artifactとruntime契約では`reportedError`と呼び、1σとは主張しません。

## chunkとcanonical record

任意日の取得で全期間を配る必要がないよう、最大4,096日ずつchunkへ分割
します。現在のスナップショットは5件で、runtimeはmanifestに列挙された
1〜16件を受け入れます。canonical復号recordの列順は次です。

```text
[
  mjdUtc,
  polarMotionStatus,
  xpMicroarcseconds,
  xpReportedErrorMicroarcseconds,
  ypMicroarcseconds,
  ypReportedErrorMicroarcseconds,
  dut1Status,
  dut1Microseconds,
  dut1ReportedErrorMicroseconds
]
```

- MJDは`chunk.startMjdUtc + zero-based index`。
- DUT1系は整数microsecond、極運動系は整数microarcsecond。
- 各seriesはchunk先頭だけ絶対値、以後は符号付き日差。
- 品質rangeは`[startOffset, endOffsetExclusive, I|P]`。
- DUT1と極運動の最大量子化誤差はそれぞれ0.5 microsecond、
  0.5 microarcsecond。
- canonical lockは復号した全9列を`JSON.stringify`したSHA-256であり、
  PM/UT1 flag、値、公表誤差のどれが変わっても不一致になる。

現行スナップショットのサイズは次の通りです。

- manifest: 4,253 bytes raw / 1,712 bytes gzip。
- 最大chunk: 109,788 bytes raw / 42,608 bytes gzip。
- manifestと全chunk: 485,258 bytes raw / 186,045 bytes gzip。

生成・検証はmanifestと各chunkをJSON 256 KiB／gzip 64 KiB、全生成物を
raw 900 KiB／gzip 300 KiB、原本を4,000,000 bytes、recordを22,000件に
制限します。公式原本は監査・再生成用でruntime bundle対象ではありません。

## runtime補間のためのデータ契約

統合artifactは日次sampleと公表誤差を提供し、補間自体はWeb/Swiftの純粋な
runtime層で行います。

- DUT1は既存契約どおり線形補間し、約±1秒のうるう秒stepを前日へsmear
  せず、次の00:00 UTCで表値へ切り替える。
- 極運動にうるう秒step処理は適用しない。
- 極運動はIERS推奨方式に合わせ、通常`k-1...k+2`の4点Lagrange補間を使う。
  端ではfirst/last 4点へwindowを移し、正確な日次sampleは原値を返す。
- 極運動の補間公表誤差は、共分散不明のため
  `sum(abs(weight) * reportedError)`の保守的envelopeとして扱い、1σとは
  呼ばない。
- 非ゼロweightの1点でも`P`なら補間値はprediction依存とする。
- invalid date、内部gap、`lastSampleMjdUtc`後を含む範囲外は外挿せずnull。
- IERS日次値から除去されている日周・半日周潮汐の復元はv1データに含めず、
  runtime metadataで未適用補正として扱う。

## parser・decoder防御

生成器とデータ検証は次をfail closedで検査します。

- UTF-8 replacement文字、NUL、短すぎる固定幅header、不正な固定小数。
- 暦日とMJDの一致、原本全行と正規化行の日次連続性。
- PM 5列、UT1 3列それぞれのall-present/all-blank、部分欠測、欠測後の再開。
- PMとUT1それぞれ独立した`I → P`単調性。
- v1で必要なPM/UT1のpaired coverage不一致。
- `|xp|, |yp| <= 2 arcsec`、公表誤差`0...1`、`|DUT1| <= 1 second`。
- exact JSON key、series長、quality rangeのgap/overlap/未被覆。
- deltaと累積値のsafe integer、累積overflow、復号後の物理範囲。
- descriptorの固定path、重複、path traversal、chunk間gap、byte数、gzip予算、
  SHA-256。
- 保存原本SHA-256、公式SHA-512、source snapshot、canonical lock、
  オフライン再生成byte列。

## 更新とオフライン再現

通常のbuild、test、CIはネットワークへ接続しません。

```sh
# 明示的な公式データ更新。原本、統合EOP、互換DUT1を書き換える
npm run data:fetch:eop

# 保存済み原本だけから両生成物を決定的に再生成
npm run data:build:eop

# ファイルを変更せず、digestと全byte列を照合
npm run data:check:eop

# JSON Schema、意味的不変条件、digest、サイズ、offline再現を検証
npm run data:validate
```

既存の`data:fetch:dut1`、`data:build:dut1`、`data:check:dut1`は対応するEOP
commandへの互換aliasです。`script/update_dut1.mjs`も
`script/update_eop.mjs`への薄いCLI wrapperとして残します。

`--fetch`は原本と公式checksumの公開切替が一時的にずれる場合、候補一式を
最大3回再取得し、一致しない組を保存しません。`--build`と`--check`は
`shared/eop/source/`だけを読み、通信しません。
