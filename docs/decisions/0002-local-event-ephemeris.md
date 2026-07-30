# ADR 0002: 食・掩蔽を遅延読込するDE442sイベント層として実装する

- 状態: 採用
- 日付: 2026-07-30
- 対象期間: 1900-01-01T00:00:00Z〜2100-12-31T23:59:59.999Z

## 背景

既存の200項地球暦は肉眼向け星図を軽く描くためのモデルで、未短縮SOFA
`epv00`に対する太陽方向残差は1900〜2100年で最大約0.84秒角である。
これは通常の星図には十分だが、太陽・月の縁が接する時刻を求める日食、
月食、月による恒星掩蔽には使えない。

一方、全期間のJPL SPKをそのままWebへ配ると約31 MiBになり、現在の初期
転送予算と「軽いアプリ」という目標に反する。食・掩蔽を使わない利用者の
起動時間、転送量、メモリを変えない構成が必要である。

## 判断

- イベント用の正本暦はJPL DE442sを固定して使う。
- 生成時だけSPKを読み、SSB→Earth-Moon barycenter、SSB→Sun、
  Earth-Moon barycenter→MoonのType 2 Chebyshev係数を抽出する。
- 係数はFloat32へ量子化するが、時刻、JD、Clenshaw評価、接触時刻の求根は
  Float64で行う。
- 1900〜2100年を5年単位のlittle-endianバイナリへ分割し、manifestに
  元SPKのURL・hash、係数構造、対象期間、各chunkのhashと実測誤差を持たせる。
- Webは利用者が「現象」を選んだ時だけ同一originから必要chunkを取得し、
  macOSは同じchunkをアプリ内resourceから必要時だけ読む。
- TypeScriptとSwiftは小さな独立実装とし、共有manifest、共有fixture、
  同一イベントID、同一許容差で差異を検出する。WASMは採用しない。
- 初版の日食と恒星掩蔽は平均月縁を使う。月面地形による接触差や接食は
  「平均月縁・目安」と明示し、地形対応tierと分ける。

## データ経路

```text
JPL DE442s (TDB / ICRF / km)
  └─ offline generator + source/hash lock
       ├─ manifest
       ├─ 5-year coefficient chunks
       ├─ coarse eclipse candidate index
       └─ shared reference fixtures
            ├─ TypeScript event core → React lazy feature
            └─ Swift event core → SwiftUI native feature
```

EarthのSSB位置は、DE442sの質量比を用いて次のように復元する。

```text
Earth = EMB - MoonFromEMB / EMRAT
MoonFromEarth = MoonFromEMB × (1 + 1 / EMRAT)
SunFromEarth = SunFromSSB - EarthFromSSB
```

アプリではUTCを入力の正本とし、既存のTAI・TT・UT1解決を再利用する。
暦評価はTDBで行い、観測者位置、光行時間、年周・日周光行差、歳差章動、
地球回転、極運動をイベント専用の有限距離天体パイプラインで扱う。
恒星用の無限遠光源補正を月へ流用しない。

## 精度契約

係数量子化単体の最初の受け入れ上限は次とする。全レコード境界と固定乱数の
密な時刻集合で、元SPKのFloat64評価と比較する。

| 項目 | 上限 |
| --- | ---: |
| 地心太陽方向 | 0.02秒角 |
| 地心月方向 | 0.02秒角 |
| 地心太陽位置 | 10 km |
| 地心月位置 | 40 m |
| 通常の平均月縁接触への量子化寄与 | 0.1秒 |

エンドツーエンドの初期目標は、独立した基準値に対して日食の平均月縁接触
2秒以内、明るい恒星の平均月縁掩蔽2秒以内、月食接触10秒以内とする。
実測が目標を満たさないイベント種別は「参考計算」へ降格し、表示桁を増やして
精度を装わない。

以下は別の不確かさとして常に追跡する。

- 地点の水平精度と標高
- IERS EOPが観測値、予測値、収録外のどれか
- 将来の未確定うるう秒と過去のDelta T
- 平均月縁と実月縁地形との差
- 地形、建物、雲、視程を計算していないこと

## 性能・プライバシー契約

- 現象を開かない限り、イベントUI、候補索引、係数chunkを初期chunkへ含めない。
- 初期Web予算の現行上限を増やさない。
- 初回の現象表示は、UI・索引・現在期間の暦を含めgzip 512 KiB以下を目標とする。
- 係数chunkはLRUで現在と隣接期間だけ保持する。
- 地点、標高、検索期間、選択イベントをURLや外部通信へ含めない。
- Webの取得先はビルド済み同一origin assetだけとし、外部APIを使わない。

## 影響

- 元SPKを直接同梱するより大幅に小さいが、イベントを初めて開く時には追加読込が
  生じる。
- TypeScriptとSwiftの二実装を保守するため、共有fixtureと境界試験が必須になる。
- DE442sだけでは月面地形と月姿勢を十分に表せない。接食やベイリービーズの
  高精度化には別データと別ADRが必要である。
- 小惑星掩蔽は軌道更新と狭い影経路の不確かさが大きいため、このADRのMustには
  含めない。
