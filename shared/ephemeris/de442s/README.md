# DE442s 食・掩蔽向け共有暦

`de442s-manifest.v1.json`と`chunks/*.v1.bin`は、JPL DE442sのうち
1900-01-01 00:00:00 TDBから2101-01-01 00:00:00 TDBまでに必要な次の
SPK Type 2系列だけを抽出した共有artifactです。

- SSB → Earth-Moon barycenter（NAIF target 3 / center 0）
- SSB → Sun（target 10 / center 0）
- Earth-Moon barycenter → Moon（target 301 / center 3）

既定の軽量星図が使う`../truncated-earth-heliocentric.v1.json`とは用途を
分離しています。このartifactは、食・掩蔽機能が必要になった時だけ対象時期の
chunkを読み込むためのものです。

## 原本と再生成

原本はNASA/JPL NAIFの
[`de442s.bsp`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de442s.bsp)
です。生成器は処理前に次の3条件をすべて検査します。

- サイズ: `32701440` bytes
- MD5: `cc49327e06088124c0e39d8dde9f0b58`
- SHA-256: `54d97562a5b094d298b1b8eafa5a2e17e3e010ce85e1a366d07f003ad159323c`

```sh
npm run data:build:de442s -- --source /path/to/de442s.bsp
npm run data:check:de442s -- --source /path/to/de442s.bsp
```

生成器は外部packageを使わず、固定されたlittle-endian DAF/SPK summaryと
Type 2 trailerを直接読みます。`--check`はmanifest、fixture、全41 chunkの
byte列、chunk集合を再生成結果と照合します。入力BSP自体はrepositoryや
アプリbundleへ含めません。

## 時刻とchunk境界

暦日は先発グレゴリオ暦の00:00:00 TDBとしてJDへ変換します。SPKの時刻、
JD、正規化時刻、補間評価はすべてFloat64です。5暦年ごとのchunkとし、
最後だけ2100-01-01〜2101-01-01の1年です。

通常のchunk選択は開始を含み終了を含みません。artifact全体の
2101-01-01だけは含みます。Type 2レコードは切断せず、各5年境界で選ばれる
元レコードを左右のchunkへ同一内容で複製します。このため境界をどちらの
chunkから評価しても同じ値になります。

## binary layout

整数と浮動小数点はすべてlittle-endianです。

### 32-byte header

| offset | 型 | 内容 |
| ---: | --- | --- |
| 0 | ASCII[8] | `PLDE4421` |
| 8 | UInt32 | format version `1` |
| 12 | UInt32 | series count `3` |
| 16 | Float64 | chunk開始、TDB seconds past J2000.0 |
| 24 | Float64 | chunk終了、TDB seconds past J2000.0 |

headerの直後に系列順`emb`, `sun`, `moon`で32-byte directory entryが3件
続きます。

| entry offset | 型 | 内容 |
| ---: | --- | --- |
| 0 | Int32 | NAIF target |
| 4 | Int32 | NAIF center |
| 8 | Int32 | NAIF frame（J2000=`1`） |
| 12 | Int32 | SPK data type（`2`） |
| 16 | UInt32 | record count |
| 20 | UInt32 | 1軸あたりの係数数 |
| 24 | UInt32 | record dataのbyte offset |
| 28 | UInt32 | record stride |

各recordはFloat64のmidpointとradiusを16 bytes、その後にX、Y、Z順で
Float32 Chebyshev係数を格納します。係数以外をFloat32へ落としません。
record末尾は8-byte境界までゼロpaddingします。offset、stride、件数、
SHA-256、raw/gzipサイズはmanifestにも記録します。

正規化時刻を

`tau = (epochSeconds − midpointSeconds) / radiusSeconds`

として、位置は`Σ c[k] T_k(tau)` km、速度はその解析微分を
`radiusSeconds`で割ったkm/sです。元SPKと同じくframeはJ2000です。

## 再現fixtureと量子化誤差

`../../fixtures/de442s-ephemeris.v1.json`には全42 chunk境界と9個の固定時刻を
収録しています。内部境界は左右両方のchunkを検査するため82 chunk比較です。
各系列について、元BSPのFloat64係数から直接評価した位置・速度、pack後の
値、3次元誤差を保持します。

これに加え、生成時にはcoverage内の全Type 2 source recordを開始・中央・終了
で評価します。重複を除いた82,602評価点での最大量子化誤差は次の通りです。

| 系列 | 位置 | 速度 |
| --- | ---: | ---: |
| SSB → EMB | 8.391 km | 0.00167 m/s |
| SSB → Sun | 0.0698 km | 0.000000769 m/s |
| EMB → Moon | 0.0242 km | 0.0000700 m/s |

fixtureのhard limitはそれぞれmanifest生成器とschema外の意味検証へ固定して
います。これは係数量子化だけの比較であり、TDB変換、光行時間、地球姿勢、
月縁地形など、最終的な食・掩蔽時刻の誤差を表すものではありません。

## 出典

DE442の積分内容、対象天体、有効期間はJPLの
[`de442_tech-comments.txt`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de442_tech-comments.txt)
を参照してください。利用時はJPL/NAIFを出典として明示します。
