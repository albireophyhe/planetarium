# 天文計算モデル v2

- 版: 2
- 対応期間: 1900-01-01 から 2100-12-31
- 目的: 肉眼向けプラネタリウムの見かけの恒星位置
- 非対象: 測地、航法、食・掩蔽、精密測光、望遠鏡の自動導入

v2 は v1 を置換しない。`calculateStarPosition` と
`bright-stars.v1.json` は互換性のためそのまま残し、新しい利用側だけが
`calculateApparentStarPositionV2` と `bright-stars.v2.json` を選ぶ。

## 計算の流れ

```text
BSC5P J2000.0 FK5 座標
  → J2000 FK5からHipparcos/ICRSへの回転・スピン接続
  → 固有運動（距離と視線速度があれば3次元直線運動）
  → 年周視差（視差値がある星）
  → 太陽による重力光偏向
  → 年周光行差
  → IAU 2006 フレームバイアス・歳差
  → IAU 2000B 章動
  → 見かけ赤経・赤緯
  → UT1による見かけ恒星時でTIRSへ地球回転
  → IERS極運動でITRSへ変換
  → 局所East–North–Up方向
  → WGS84観測者の日周光行差
  → 真空中の見かけの地平座標
  → 任意の光学・近赤外大気差
```

結果には幾何高度と大気差適用後の高度を別々に保持する。すべての既定値、
近似、未適用補正は `metadata` に残す。

## フレーム単位の性能契約

約8,400星を連続描画するとき、単星用の互換ラッパーを星ごとに呼んでは
ならない。観測日時、地点、オプションが同じ1フレームにつき一度だけ
コンテキストを作り、それを全星へ再利用する。

```ts
const context = createApparentPositionContextV2(date, location, options);
const { stars } = await loadPrecisionStarCatalogV2();
const positions =
  calculateLightweightApparentStarPositionsWithContextV2(
    stars,
    context
  );
```

`createApparentPositionContextV2` は次を一度だけ計算する。

- UTC/TAI/TT/UT1 の解決
- 77項章動、IAU 2006歳差・章動行列
- 見かけ恒星時
- 共有200項VSOP2000地球状態または外部の観測者位置・速度・太陽方向の準備
- 観測地点の三角関数
- WGS84観測者の地球自転速度と日周光行差係数
- 任意の大気差係数

返すコンテキストとその行列・ベクトル・警告配列は実行時にも凍結され、
再利用中に変化しない。軽量バッチは座標、投影値、適用モードだけを返し、
星ごとの `metadata`、警告配列、未適用補正配列を生成しない。選択中の星や
診断表示だけには `calculateApparentStarPositionWithContextV2` を使う。
`calculateApparentStarPositionV2` は一回限りの計算用に同じコンテキストを
内部生成する互換ラッパーである。v2 星表は非同期ローダーにより別チャンクに
分離し、v1 だけを使う画面の初期 JavaScript に二重の星表を含めない。

Web UIは読みやすさと長時間再生時の割り当て量を優先し、同梱8,404星のうち
等級5.0以下と固有名・星座線に必要な1,630星をフレーム計算へ渡す。
Node.js 24.18と固定したVitest 4.1.10で
`npm run web:bench:precision`を実行した。太陽重力光偏向を含む既定経路の
1,630星バッチはmean 1.2290 ms、p75 1.2311 ms、p99 1.4723 ms
（1,628 samples）、公開APIで全8,404星を渡した場合はmean 5.5076 ms、
p75 5.5665 ms、p99 6.0705 ms（364 samples）だった。200項地球暦、
時刻系、歳差章動、EOP行列を含むcontext生成はmean 0.0049 ms、
p99 0.0060 msである。返却オブジェクトの保持量は全量で
約2.96 MB/フレーム、1,630星で約574 KB/フレームとなる。Web UIの
12 Hz再生時は約6.89 MB/s、全量では約35.50 MB/sの割り当てに相当する。
全量を高頻度で長時間処理する利用側は、
用途に応じて星を絞るか、将来のtyped-array出力を検討する。

長時間再生相当のsoakでは、1,630星を1900–2100の10,000日時へ更新し、
16,300,000位置の赤道・地平・投影成分をfinite検査した。
`npm run web:bench:precision:soak`の計測sampleは12.174秒、
821.4 frame/s、有限値違反0、明示GC後のretained heap増加108,888 bytes
だった。独立したcalibration runも11.709秒、854.0 frame/s、
heap増加626,304 bytesで、32 MiBの保持増加guardを超えなかった。

## 恒星カタログと固有運動

v2 星表は NASA HEASARC の Bright Star Catalog 5th Edition
Preliminary（BSC5P）を、`Vmag <= 6.5`、HR 昇順で取得した生成物である。
v1 の先頭8列を同じ値・順序で保持し、次の4列を末尾へ追加した。

| 列 | 単位 | 意味 |
| --- | --- | --- |
| `pmRaCosDecArcsecPerYear` | arcsec/year | `cos(dec) × d(RA)/dt` |
| `pmDecArcsecPerYear` | arcsec/year | `d(dec)/dt` |
| `parallaxArcsec` | arcsec | 三角または動力学視差 |
| `radialVelocityKmPerSecond` | km/s | 太陽中心視線速度 |

HEASARC は J2000.0 FK5 の固有運動、視差、視線速度を提供する。
原カタログ ReadMe は `pmRA` が通常の投影固有運動
`cos(dec) × d(RA)/dt` であることを明記している。

J2000時点でSOFA `fk5hip` / `fk52h` 由来の回転行列とフレームスピンを
位置・速度ベクトルへ適用し、Hipparcos/ICRSに整合した方向へ接続する。
視差が正の恒星は距離と接線速度を持つCartesian位置・速度として伝播する。
視線速度もある場合は古典的な3次元直線運動として遠近加速度を含める。
視線速度がない場合も距離を保持し、視線速度を0と明示的に仮定して
年周視差を適用する。正の視差がない星だけは球面接平面上の固有運動を
適用する。
固有運動が欠ける場合もフレーム回転・スピンは適用し、星表固有運動が
ないことを警告する。
`null`は収録なしとして扱うが、非有限の固有運動・視差・視線速度は入力
破損として拒否する。距離を復元できる星は接線・視線速度を合成し、光速
以上となる非物理的な入力も拒否する。

BSC5P の格納分解能は赤経0.1秒（時角）、赤緯1秒角、固有運動
0.001秒角/年である。したがって、内部の歳差・章動式がミリ秒角級でも、
エンドツーエンドの位置をサブ秒角精度とは扱わない。BSC5P は FK5 星表で
あり、最新の ICRS 高精度星表への置換でもない。
同梱EOP収録内の「概ね1〜数秒角級」は、この格納分解能から見た真空中の
通常目安であり、全恒星の実測精度を保証する値ではない。大気差ON時の
表示高度はこの目安と分けて扱う。

BSC5Pの視差種別と視線速度コメントは現在のv2生成物へ保持していない。
3次元運動を適用する2,984星のうち2,107星（70.6%）には動力学視差または
視線速度の品質・変動・分光連星等の注記が原表にある。v2はカタログ値を
期間中一定の入力として扱うため、`three-dimensional` は計算経路を表すだけで
観測値の品質保証ではない。将来の星表版では品質列を保持する。

出典:

- [NASA HEASARC BSC5P](https://heasarc.gsfc.nasa.gov/W3Browse/catalog/bsc5p.html)
- [BSC5P 原カタログ ReadMe](https://cdsarc.cds.unistra.fr/ftp/cats/V/50/ReadMe)

## 共有200項地球暦

既定の地球状態は
`shared/ephemeris/truncated-earth-heliocentric.v1.json`を正本とする。
SOFA 2023-10-11 `epv00.c`の太陽中心→地球の位置級数
`e0*`、`e1*`、`e2*`に含まれる1,323項から、J2000を中心とする
±100 Julian年での寄与上限
`abs(amplitude) × 100^timePower`が大きい200項を決定論的に選ぶ。
`script/build_earth_ephemeris.mjs`は公式`epv00.c`を入力に、元ファイルの
SHA-256
`939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a`
を確認して共有artifactを生成・再現確認する。公式アーカイブのSHA-256は
`d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2`
である。

Web実装は共有係数をSOFA `epv00`と同じ固定行列でBCRS方向の軸へ回転し、
太陽中心→地球の位置と級数の解析微分速度を同時に求める。時刻引数には
TTをTDBのproxyとして使う。解析微分はAU/dayで得て、年周光行差では
光速のAU/day値で割った無次元`v/c`へ変換する。結果modeは
`truncated-vsop2000-heliocentric-earth`である。完全なBCRS地球状態では
なく、太陽系重心（SSB）→太陽の位置・速度と、地球中心→実観測地点の変位を
含まない。特に年周光行差へ渡す速度は本来の太陽系重心速度ではなく、
太陽中心速度である。

未改変SOFA `epv00`に対して1900-01-01 00:00から
2100-12-31 18:00までを6時間刻み293,656時点で比較した。`natural`は地球から太陽への単位方向、
`proper`はそれへ年周光行差を適用した方向である。

| 指標 | 最大差 | RMS差 |
| --- | ---: | ---: |
| `natural`方向 | 0.8324427秒角 | 0.1756056秒角 |
| `proper`方向 | 0.8413076秒角 | 0.1757668秒角 |
| 速度ベクトル | 16.4057 m/s | 12.7926 m/s |

速度差のうち太陽方向へ効く横成分は最大0.0111886秒角であり、大部分は
省略したSSB→太陽速度である。太陽・地球距離の最大差は310.19 kmだった。
これらは対応期間内のプラネタリウム用途を対象にした監査値であり、共有
artifactを汎用の精密エフェメリスとして扱う根拠にはしない。

この係数artifact、生成規則、TypeScriptでの評価と解析微分はSOFA
`epv00`からの派生物である。差分と完全なライセンスは
`shared/licenses/IAU-SOFA-derived-work-notice.md`に記録する。

## 年周視差

正の視差値がある恒星は、伝播後のHipparcos/ICRS整列済み恒星位置をAUで
保持する。観測者位置を同じ軸・原点のAUベクトルとして減算して正規化し、
自然方向を得る。

```text
natural direction = normalize(star position − observer position)
```

この独立したユークリッドベクトル計算はSOFA由来コードではない。計算順は
空間運動、年周視差、太陽重力光偏向、年周光行差、歳差・章動である。

既定の観測者位置は、共有200項地球暦の太陽中心→地球位置を、太陽系重心から
観測者までの位置のproxyとして使う。したがって、太陽系重心から太陽までの
変位（おおむね0.01 AU級）と、地球中心から実観測地点までの変位を含まない。
最も近い収録星でも前者はおおむね8ミリ秒角級の誤差源で、BSC5Pの格納精度
より小さいが、BCRSとして原点が厳密に一致する既定暦ではない。結果は
`truncated-vsop2000-heliocentric-earth`と
`annual-parallax-approximate-ephemeris`で明示する。

高精度暦を持つ利用側は、`annualParallax.observerPositionAu`へ
太陽系重心から実観測地点までのBCRS/Hipparcos整列済み位置をAUで渡せる。
地球中心までの位置だけを渡す場合は日周視差を含まない。`false`を渡すと
年周視差を無効にでき、視差値がない星は`unavailable`となる。

v2星表8,404星のうち正の視差値を持つ2,985星で既定経路を利用できる。
1900、J2000、2026、2100年の全星finite検査に成功し、監査ケースでの最大
年周変位は0.730秒角だった。これは収録星の最大視差0.751秒角と整合する。

未改変SOFA `fk52h → pmpx`を使い、Siriusと外部の太陽系重心基準観測者位置
`[0.9, 0.4, 0.1] AU`で比較した自然方向差は0.003924ミリ秒角だった。
既定proxyの主な原点差は省略したSSB→太陽位置である。さらに共有200項化の
位置残差と、地球中心→実観測地点の変位が加わる。厳密なBCRS観測者位置が
必要な利用側は、既定proxyではなく外部位置を渡す。

## UTC、TAI、TT、UT1

JavaScript `Date` を UTC として受け取り、次を分けて計算する。

```text
UT1 = UTC + DUT1
TT  = UTC + (TAI−UTC) + 32.184秒
```

- `DUT1` は利用側から渡せる。純粋な計算APIへ未指定の場合は0秒を使い
  `dut1-assumed-zero` を返す。現行の整数うるう秒UTCが維持され、
  `|UT1−UTC|` を約0.9秒以内に保つ期間では、時角に最大約13.5秒角相当の
  差になり得る。これはDUT1だけの条件付き目安で、1972年以前と将来の
  UTC制度を含む全対応期間の上限ではない。xp/yp=0近似では、同梱履歴で
  最大約0.6秒角の極運動ベクトルも省略する。
- IERS Bulletin A `finals2000A.all`のDUT1・極運動統合データを`shared/eop/`へ
  同梱し、WebとmacOSアプリは収録期間内の値をpipelineへ自動注入する。
  Webは対象期間chunkだけを遅延読込し、macOSはmanifestが列挙する全chunk
  （現在は5件）をアプリへ同梱する。日次値は線形補間する。うるう秒の
  約±1秒stepは同一UTC日へsmearせず、翌日00:00で切り替える。`I`から`P`へ
  またぐ補間は予測扱い、IERS公表誤差は両端の最大値とする。公式formatが
  信頼水準を定義していないため、1σとは仮定しない。
  収録範囲外または検証・読込失敗時は0秒近似へ戻し、両アプリの状態行と
  詳細に明示する。
- `TAI−UTC` は利用側から渡せる。未指定時は1972年以降の IERS
  うるう秒履歴を使う。
- IERS Bulletin C 72 は2026年12月末にうるう秒を入れないことと、
  `TAI−UTC = 37秒` を確認している。次回以後を確定できない日付には
  既知最後の37秒を仮定し、`future-leap-seconds-unknown` を返す。
- 1972年以前の UTC は整数うるう秒方式ではない。利用側から値がない場合は
  `TAI−UTC = 0` の近似とし、`pre-1972-utc-tt-approximation` を返す。
- `Date` は `23:59:60` を表現できないため、うるう秒そのものの瞬間を精密に
  表す API ではない。

TT は歳差・章動、UT1 は地球回転角に用いる。同梱スナップショットより新しい
EOPや別の精度要件を持つ利用側は、対象日のIERS Earth Orientation
ParametersからDUT1と極運動xp/ypを明示的に渡せる。

出典:

- [IERS の時刻系説明](https://www.iers.org/iers/en/service/faqs/time/whatithetimeargumentforusingiersproducts-157)
- [IERS Bulletin C 72](https://datacenter.iers.org/data/html/bulletinc-072.html)
- [IERS Conventions 2010, Technical Note 36](https://www.iers.org/SharedDocs/Publikationen/EN/IERS/Publications/tn/TechnNote36/tn36.pdf?__blob=publicationFile&v=2)

## 歳差、章動、恒星時

歳差とフレームバイアスには IAU 2006 Fukushima–Williams 角を使う。章動は
IAU 2000B の77項短縮級数と、SOFA が厳密な適用順序向けに採用する固定惑星
補正を使う。IAU 2000B の公称内部精度は1900–2100でおおむね1ミリ秒角である。

これは「IAU 2006 + 調整済み IAU 2000A」の正式な 06A 構成ではない。
高速な肉眼星図向けに、IAU 2006 バイアス・歳差と短縮 IAU 2000B を明示的に
組み合わせた派生モデルである。

グリニッジ平均恒星時は IAU 2006 の GMST を使う。見かけ恒星時は
`GMST06 + dψ cos(εA)` とし、微小な分点均差補足項を省略する。この差は
未改変 SOFA C の `gst06` と30日刻みで比較し、1900–2100の2448時点で
最大2.6493ミリ秒角、RMS 1.8590ミリ秒角だった。

出典:

- [IAU SOFA 現行リリース](https://www.iausofa.org/current-software)
- [SOFA ANSI C 2023-10-11](https://www.iausofa.org/2023-10-11c)
- [SOFA ライセンス](https://www.iausofa.org/terms-and-conditions)

## 太陽中心高度と薄明

昼・薄明の背景は、旧版のUTC≈UT1簡易太陽式ではなく、恒星と同じ
フレーム単位contextから求める。TT時刻の共有200項地球暦で太陽中心→地球の
BCRS方向ベクトルを作り、符号を反転して地心から太陽中心への自然方向とする。
太陽自身の光に太陽重力光偏向は適用せず、年周光行差、
IAU 2006/2000B歳差章動、GAST、IERS極運動、WGS84日周光行差の順で
幾何高度へ変換する。GASTと極運動でITRSへ移した地心方向を太陽距離AUで
尺度化し、WGS84の観測地点ITRS位置を減算して正規化した後、日周光行差を
適用する。このため水平位置は太陽の日周視差を含み、地平線付近では最大
約8.8秒角級となる。画面や公開結果の見かけ赤経・赤緯は比較可能性のため
地心値のまま保持する。楕円体高は都市presetでは0 m、手入力では指定値、
端末測位では取得できたOSの値（取得不能時は0 m）を使う。公開APIの外部標高も
日周光行差と同じWGS84地点へ適用する。

薄明は太陽中心の真空中の幾何高度を用い、境界を0°、−6°、−12°、−18°と
する。大気差のON・OFFは恒星の表示高度だけに作用し、薄明区分には
混ぜない。日の出・日の入りの上辺接触を表す太陽半径や地平線大気差の
`−0.833°`慣例ではないため、公式の日出没時刻予報とは用途が異なる。
画面には内部値を0.1°へ丸めた「太陽高度」を表示する。

`shared/fixtures/sofa-solar-position.v1.json`は、未改変SOFA Cの
`epv00 → ab → pnm06a / c2i06a → pvtob → apio13 → atioq`で得た
8ケースの地心から太陽中心への方向、地心の真赤道／真分点方向、
WGS84 topocenterのENU方向を固定する。標高4,205 mで地平線付近となる
Mauna Keaケースを含む。
SOFA `epv00`の全1,323項、太陽系重心速度、IAU 2006A/2000A経路に対し、
共有200項地球暦と
IAU 2000Bを通した全パイプラインの球面角残差を2秒角未満に固定する。
8ケースの実測最大は、地心赤道方向0.6449秒角、WGS84 topocenterの
水平方向0.6456秒角だった。SOFA側は`pvtob`のCIRS観測地点位置を
太陽ベクトルから減算して日周視差を含め、`apio13` / `atioq`では
大気差を無効にする。太陽半径は両側とも含めない。
アプリは年周光行差の後に地心視差を逐次適用するため、完全な同時変換との
交差項は最大約0.85ミリ秒角、続く日周光行差との交差項は最大約14マイクロ
秒角と見積もる。合計0.9ミリ秒角未満であり、現行200項地球暦と歳差章動の
約0.84秒角級の残差より十分小さい。
2050年以後のケースはSOFA 2023-10-11に同梱されたうるう秒表を固定し、
将来のTAI−UTCを37秒と仮定する。
これは薄明境界の用途には十分小さいが、太陽面観測や精密な日出没時刻には
使わない。

出典:

- [SOFA ANSI C 2023-10-11](https://www.iausofa.org/2023-10-11c)
- [SOFA ライセンス](https://www.iausofa.org/terms-and-conditions)

## 太陽重力光偏向

遠方の恒星に対する太陽の単体光偏向を、SOFA 2023-10-11の`ld` / `ldsun`
から派生したベクトル式で適用する。`p`を観測者から恒星への自然方向、
`e`を太陽から観測者への単位方向、`em`を太陽・観測者距離（AU）とすると、
概略は次の通りである。`SRS`はSOFAと同じ
`1.97412574336e-8 AU`を使う。

```text
dlim = 1e-6 / max(em², 1)
w = SRS / em / max(p · (p + e), dlim)
deflected = normalize(p + w [p × (e × p)])
```

`ldsun`と同じ`dlim`により、地球距離では太陽中心から約5分角以内で補正を
抑え、中心と完全に一致すると0へ戻す。これは数値特異点を避ける公式の安全
リミッターであり、太陽面を透過して恒星を表示できるという物理モデルでは
ない。食、掩蔽、太陽半径による可視性判定はv2の対象外である。SOFAの生の
`ld`出力は明示的に正規化されないが、本実装は後段の単位方向契約を保つため
最後に正規化する。

既定の`e`と`em`は、年周視差・年周光行差と同じ共有200項地球暦から得る
太陽中心→地球位置を使い、
`truncated-vsop2000-heliocentric-earth`および
`solar-light-deflection-approximate-ephemeris`を返す。
高精度エフェメリスを持つ利用側は
`solarLightDeflection.sunToObserverUnitDirection`と
`sunObserverDistanceAu`を渡せる。方向は有限な単位ベクトル、距離は有限の
正値でなければならない。`false`で診断用に無効化した場合は
`solar-light-deflection-disabled`を警告し、未適用補正へ
`solar-light-deflection`を追加する。

太陽以外の木星などによる光偏向は実装していない。太陽補正の有効・無効に
かかわらず、`planetary-light-deflection`を未適用補正へ残す。

未改変SOFAの公式`t_sofa_c.c` 1ケースと、未改変`iauLdsun`へ直接リンクした
独立Cドライバの5ケース（通常方向、太陽中心、リミッター上下、遠距離）を
共有fixtureに固定した。SOFA生出力を正規化して比較した最大成分残差は
`6.95e-16`、最大方向残差は`0.000144 µas`未満である。

出典:

- [SOFA ANSI C 2023-10-11](https://www.iausofa.org/2023-10-11c)
- [SOFA ライセンス](https://www.iausofa.org/terms-and-conditions)

## 年周光行差

光行差のベクトル式と相対論的正規化は SOFA `ab` の計算から派生した。
利用側が観測者の太陽系重心速度（光速単位）と太陽・観測者距離（AU）を
渡した場合は、その値をそのまま使う。

既定値は共有200項地球暦を解析微分した太陽中心地球速度を使う。SOFA
`epv00`が年周光行差へ使う太陽系重心地球速度とは異なり、SSB→太陽速度を
含まないため`truncated-vsop2000-heliocentric-earth`と明示する。
6時間刻み監査では速度差が最大16.4057 m/sでも、太陽方向へ効く横成分は
最大0.0111886秒角だった。位置・速度を合わせた`proper`方向の残差は、
共有200項地球暦の表に示す最大0.8413076秒角、RMS 0.1757668秒角である。

高精度エフェメリスを持つ利用側は、既定値ではなく外部速度ベクトルを渡す。

出典:

- [SOFA ANSI C 2023-10-11](https://www.iausofa.org/2023-10-11c)
- [SOFA ライセンス](https://www.iausofa.org/terms-and-conditions)
- [USNO NOVAS](https://aa.usno.navy.mil/software/novas_info)

## 日周光行差

地球と一緒に自転する観測者の東向き速度による日周光行差を、SOFAが
CIRSで処理を分ける場合に用いる一次のベクトル式として適用する。WGS84の
測地緯度と楕円体高から自転軸までの距離を求め、局所East–North–Up方向へ
次の補正を行う。

```text
magnitude = |ω × r| / c
corrected ENU = normalize([east + magnitude, north, up])
```

東を正とするため、子午線上の天体は東側へずれる。計算順は、CIRS方向を
UT1で地球回転し、極運動でITRSへ変換してから局所方向を作り、
日周光行差、地平角、大気差の順である。計算APIで楕円体高を省略した場合は
WGS84楕円体高0 mを明示的に仮定し、`observer-height-assumed-zero`を返す。
両アプリは都市presetで0 m、手入力で指定値、端末測位で取得できたOSの値
（取得不能時は0 m）を渡す。利用側は楕円体高を渡せ、診断用には補正を
無効化できる。無効時は`diurnal-aberration-disabled`を返し、
`metadata.omittedCorrections`へ`diurnal-aberration`を追加する。

東京（測地緯度35.6812°、楕円体高0 m）での最大変位は約0.26023秒角、
赤道上の理論最大は約0.32000秒角である。東京で楕円体高0 mと1,000 mの差は
約0.0408ミリ秒角なので、楕円体高0 m仮定は現在の星表精度を支配しない。

未改変SOFA C 2023-10-11の`pvtob`、`apio`、`atioq`から独立に作った7方向の
共有fixtureと比較し、係数の最大絶対残差は`2.12e-22`、ENU成分の最大残差は
`2.22e-16`、球面角残差は`0.0000392 µas`以下だった。

この実装は、既存パイプラインへ適合する従来型のsplit-at-CIRS一次式である。
将来、地心の重心速度と地上観測者の自転速度を合成できる高精度tierを作る場合は、
年周・日周光行差を逐次適用せず、合成速度から相対論的光行差を一度だけ適用する。
逐次適用の交差項は30 µas級になり得るため、現方式をそのまま「完全SOFA」
として拡張しない。

出典:

- [SOFA Astrometry Tools](https://www.iausofa.org/s/sofa_ast_c.pdf)
- [SOFA ANSI C 2023-10-11](https://www.iausofa.org/2023-10-11c)

## 極運動

同梱したIERS Finals 2000Aの日次`xp` / `yp`を、正確な00:00 UTC sampleでは
原値、それ以外では通常`k−1...k+2`の4点Lagrange補間で求める。非ゼロweightの
一点でも予測値なら結果を予測依存とし、共分散がない公表誤差は
`Σ |weight| × error`の保守的envelopeとして各軸へ残す。DUT1と極運動の
品質flagは独立に扱う。

TTからSOFA `sp00`相当のTIO locator `s′`を求め、`pom00`相当の

```text
Rpom = Rx(−yp) · Ry(−xp) · Rz(s′)
```

を構成する。見かけ方向をGASTでCIRSからTIRSへ回した後、この行列でITRSへ
変換し、固定された観測地点の測地緯度・経度からEast–North–Upを作る。
その後に日周光行差と任意の大気差を適用する。収録外または読込失敗時だけ
`xp=yp=0`へ戻し、`polar-motion-assumed-zero`と画面表示で明示する。
日周・半日周潮汐による高周波極運動は復元せず、
`subdaily-polar-motion-tides`を未適用補正へ残す。

行列、TIO locator、軸ごとの符号と合成順は未改変SOFA 2023-10-11の
`sp00` / `pom00`公式参照値で検証する。星表の入力分解能を超える精度は
主張しないが、地球固定座標をxp/yp=0とする系統的な数十分の一秒角級の
近似を通常経路から除く。

出典:

- [IERS Finals 2000A](https://maia.usno.navy.mil/ser7/finals2000A.all)
- [IERS Conventions 2010, Technical Note 36](https://www.iers.org/SharedDocs/Publikationen/EN/IERS/Publications/tn/TechnNote36/tn36.pdf?__blob=publicationFile&v=2)
- [SOFA ANSI C 2023-10-11](https://www.iausofa.org/2023-10-11c)

## 光学・近赤外大気差

大気差はオプトインである。SOFA `refco` 由来の

```text
dZ = A tan(Zobserved) + B tan³(Zobserved)
```

を数値的に逆変換し、幾何高度から観測高度を求める。入力は気圧 hPa、
気温 °C、相対湿度 0–1、波長 µm である。公開 API は可視・近赤外の
0.3–2 µm、気圧0–1100 hPa、気温−100–60 °C に制限する。さらに飽和水蒸気圧
と全圧の整合、係数の有限性と符号、逆変換の収束と単調性を検証し、
物理的に成立しない組合せはコンテキスト作成時に拒否する。

UIでは標準値（1013.25 hPa、10 °C、相対湿度50%、0.55 µm、
適用下限5°）と手動入力を区別する。手動の5項目はdraftのまま計算へ渡さず、
全項目と係数を検証した明示的な適用操作で一つの不変設定へ切り替える。
入力元は数値の一致から推測せず`standard`または`manual`として保持し、
手動値が標準値と同じ場合も`manual`のままとする。星図、選択星の軌跡、
詳細、導入用本文とJSONは同じ適用済み設定を使う。手動値はセッション限定で、
真空中の幾何座標は別値として常に保持する。

適用下限は5–30度に制限する。既定では幾何高度5度未満に式を適用せず、
`refraction-below-model-altitude` を返す。地平線付近の大気差は気象の
鉛直構造に敏感で、単純な `tan Z` 多項式を外挿してはいけない。地形、
観測者高度、局所的な温度勾配もモデル外である。
5度の境界では標準大気で約9.27分角の補正が始まり、直下との段差がある。
これは低高度へ未検証の多項式を外挿せず、適用域を明示するための既知制約で
ある。連続アニメーションが必要でも、この物理高度へ視覚的な補間を混ぜない。

## 明示的に未適用の補正

`metadata.omittedCorrections` は星と設定に応じて変わる。

- 年周視差を無効にした場合、または視差値がない場合は`annual-parallax`。
- 既定の太陽中心地球proxyでは、実観測地点の変位を含まないため
  `diurnal-parallax`。
- 外部の太陽系重心から実観測地点までの位置を渡した場合は、年周視差と
  日周視差を未適用リストから外す。
- 太陽重力光偏向を明示的に無効化した場合は
  `solar-light-deflection`。
- 太陽補正を適用した場合も、惑星による光偏向は
  `planetary-light-deflection`。
- 日周光行差を明示的に無効化した場合は`diurnal-aberration`。
- 極運動を明示的に無効化した場合、またはxp/yp=0 fallbackでは
  `polar-motion`。
- 極運動を適用した場合も潮汐による日内補正
  `subdaily-polar-motion-tides`。

観測者高度、地形遮蔽、気象の鉛直構造、光害、減光も扱わない。これらが
必要なら、SOFA や NOVAS の完全な観測位置変換、最新 EOP、精密エフェメリス、
高精度星表を利用する。

## 独立テストと測定の再現性

`shared/fixtures/astro-test-vectors.v2.json` は次を固定する。

- 未改変 SOFA の公式 `t_sofa_c.c` にある単体参照値
- 未改変 `libsofa_c.a` にリンクした独立 C ドライバの合成参照値
- 上記の恒星時・光行差スキャン結果
- FK5–Hipparcos回転・スピンと`fk52h`の公式6次元参照値

`shared/fixtures/sofa-diurnal-aberration.v1.json`は、未改変SOFAの
`pvtob → apio → atioq`から日周光行差だけを分離したWGS84係数とENU方向を
固定する。WebとSwiftは同じ7ケースを読み、純粋helperとパイプライン接続の
両方を検証する。

`shared/fixtures/sofa-solar-light-deflection.v1.json`は、公式
`t_sofa_c.c`の`ldsun`参照値と、未改変SOFA `iauLdsun`を呼ぶ独立Cドライバ
から得たリミッター境界を含む6ケースを固定する。Webは純粋helper、既定値、
外部geometry、無効化、`pmpx → ldsun → ab → BPN`の順序を別々に検証する。

`shared/fixtures/sofa-solar-position.v1.json`は、未改変SOFA `epv00`、
年周光行差、IAU 2006A、IERS地球姿勢を通した太陽中心→地球位置、
地心の真赤道／真分点方向とWGS84 topocenterのENU方向を8ケースで固定する。
共有200項経路では地球暦方向1秒角、距離`0.000003 AU`、全パイプライン
2秒角未満を検証する。

使用した公式アーカイブの SHA-256 は
`d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2`、
`t_sofa_c.c` は
`87ec88eac0be306a7060f984af2f1506ade2148332ea9ec70922eb3bf39b382d`
である。合成ケースは Sirius、Arcturus、Polaris を1900年、2026年、
2100年の地点・DUT1付きで検証する。

合成ケースは公式SOFAの`fk52h`から`starpm`を通した値を基準とする。
v2の古典的な直線運動との差を含むため、極で不安定な赤経成分ではなく
球面方向差を比較し、許容差は`1e-9 rad`とした。3ケースの実測方向差は
最大0.0039ミリ秒角であり、
未接続FK5を直接投入した場合の50–118ミリ秒角級の差を十分検出する。
正の視差と視線速度を持つ2,984星を1900年、J2000、2026年、2100年の
11,936ケースで公式`fk52h → starpm`と比較した最大方向差は
0.1465ミリ秒角である。残差はSOFAが扱う光行時間変化と相対論的な
カタログ・PV変換を、v2の古典的直線運動が意図的に省略するためである。

SOFA 由来コードの差分一覧は各プラットフォームのnotice、ライセンス全文と
共通帰属は`shared/licenses/IAU-SOFA-derived-work-notice.md`に記録する。
