# 食・掩蔽予報の精度検証

- 更新日: 2026-07-30
- 対象: DE442sイベント層 v1
- 時刻表示: 観測地点の現地時刻とUTC（候補データだけTDB）

## 現在確認できている精度

### 全球候補索引

JPL DE442sから生成した1900〜2100年の候補を、NASA/GSFCのFive
Millennium Catalogの1901〜2100年部分と照合した。

- 日食: NASAの452件と一対一で一致
- 月食: NASAの457件と一対一で一致
- 最大時刻seedの差: 全件45.5秒未満
- 2026-08-12日食: 35.078秒
- 2024-04-08日食: 19.652秒

seedは局地接触計算の探索窓を中央付近へ置くための値で、利用者へ最終予報として
表示する値ではない。日食の「最大」は定義と平均月縁モデルでも数十秒変わり得る。
生成処理だけに依存しない回帰検査として、NASAの
[2021〜2030年一覧](https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html)
22件を共有fixtureへ転記し、WebとSwiftの配布候補が日付・分類で一対一に一致し、
全球seedが公表TDの90秒以内にあることも固定する。

月食についても同じNASA一覧の22件を別の共有fixtureへ転記し、WebとSwiftの
DE442s局地solverを全件実行して検証する。全22件で分類が一致し、最大時刻は
公表TDをTTとしてUTCへ換算した値から3秒以内、部分月食・皆既月食の本影食分は
公表値から0.005以内に固定する。半影月食では一覧表の負の「本影食分」とアプリが
表示する正の「半影食分」は定義が異なるため、数値を直接比較せず、画面上の項目名も
「半影食分」と明示する。

### 地球自転（UT1・ΔT）と対応年代

同梱IERS EOPは1973-01-02 00:00 UTC〜2027-07-31 00:00 UTCを収録し、
この範囲ではDUT1と極運動xp・ypの観測値または予測値を使う。データの読込・
digest検証に失敗した場合は多項式へ黙って切り替えず、予報の読込エラーとして
扱う。

収録範囲外では、NASAが公開する2004年版の区分ΔT多項式をDE442sと組み合わせる。
NASAの多項式が仮定する月の永年加速度−26秒角/cy²を、DE44xの
約−25.936秒角/cy²へ同資料の式で補正する。ただし月暦に依存しない観測値から
得た1955〜2005年は補正しない。2027-07-31より後は、補正済み多項式の変化量を
同梱IERS予測最終sampleのΔT 69.231694秒へ連続接続する。

| 年月 | 使用するΔT | 時刻の保守的不確かさ | 地球赤道上の経路換算 |
| --- | ---: | ---: | ---: |
| 1900-01 | −2.745秒 | ±1.0秒 | ±0.47 km |
| 1950-01 | 29.087秒 | ±1.0秒 | ±0.47 km |
| 2050-01 | 86.262秒 | ±16.86秒 | ±7.84 km |
| 2100-01 | 195.945秒 | ±49.31秒 | ±22.93 km |

将来値の幅はNASAの長期標準誤差近似の増分、旧多項式と現行IERS終端の差、
終端sampleの公表誤差を線形加算した工学的envelopeで、統計的な信頼区間とは
呼ばない。日食の表示経路には、球面月縁からの実月縁地形の偏差として基礎幅
±6 kmも加算する。NASA/GSFCはこの偏差を約±3秒角（平均月距離で約±6 km）
とし、月縁補正なしでは接触時刻と継続時間が通常2〜3秒、経路限界付近では
さらに大きくずれ得るとしている。この境界幅は発生・分類を断定しないための
保守的な工学的envelopeであり、LRO等の時刻別月縁プロファイルの代替ではない。
根拠は
[NASA/GSFCの月縁と日食予報](https://eclipse.gsfc.nasa.gov/SEhelp/limb.html)
を参照する。

IERS範囲外でも画面上の日付はcivil UTCとして保持する。1972年以前は
`TAI−UTC=0秒`のproleptic UTC、2027-07-31より後は`TAI−UTC=37秒`を固定した
連続UTCシナリオとし、`DUT1 = TAI−UTC + 32.184 − ΔT`からTT−UT1を再現する。
歴史UTCの復元誤差と将来の公式UTC制度との差は上表の数値幅に含めず、その旨と
ΔTモデルを予報の注意・再現情報へ表示する。

### 現地年とイベント暦の安全な収録範囲

予報一覧はUTC年ではなく、観測地点のタイムゾーンにおける最大時刻の現地年で
区切る。DE442sの見かけ太陽・月位置には最大600秒の光行時間lookbackが必要なため、
イベントsolverが安全に受信時刻として扱える閉区間は次の範囲になる。

```text
1900-01-01T00:09:27.817Z
  through
2100-12-31T23:58:50.816Z
```

このため、対応年の両端だけはタイムゾーンによって現地年の一部を覆えない。
共有fixtureはWebとmacOSで次の代表ケースを同じ値へ固定する。

| 現地年とオフセット | 予報に含められない範囲 |
| --- | ---: |
| 1900年・UTC+14 | 年初の約850分 |
| 1900年・UTC | 年初の約10分 |
| 2100年・UTC | 年末の約2分 |
| 2100年・UTC−12 | 年末の約722分 |
| 1901〜2099年・対応オフセット全域 | なし |

画面は該当する1900年または2100年だけに、観測地点の実タイムゾーンoffsetから
求めた欠落時間を表示する。これは「その間に現象がない」という判定ではなく、
イベント用暦の収録範囲外で予報へ含められないという意味である。境界値、
offset入力範囲、Web／Swift parityは
`shared/fixtures/event-forecast-year-coverage.v1.json`で検証する。

月加速度補正の式は
[NASA/GSFCのΔT多項式](https://eclipse.gsfc.nasa.gov/LEcat5/deltatpoly.html)、
DE44xの値は
[JPL HorizonsのDE441更新記録](https://ssd.jpl.nasa.gov/horizons/news.html)
に基づく。

### 2026-08-12 ロンドンの日食

観測点をNASA表と同じ北緯51°30.0′、西経0°10.0′、標高0 mとし、
DE442s、平均月縁、UT1−UTC=0秒で局地計算した。

| 項目 | アプリ計算 | NASA公表値 | 差の読み方 |
| --- | ---: | ---: | --- |
| C1 | 17:17:22.700 | 17:17（分丸め） | 公表分の中央から+22.7秒 |
| 最大 | 18:13:22.348 | 18:13（分丸め） | 公表分の中央から+22.3秒 |
| C4 | 19:06:21.668 | 19:06（分丸め） | 公表分の中央から+21.7秒 |
| 食分 | 0.925530 | 0.925 | +0.000530 |
| 面積遮蔽率 | 0.914397 | 0.914 | +0.000397 |

NASA表は時刻を分単位で丸めているため、この比較だけから秒単位の絶対誤差は
確定できない。少なくとも三接触すべてが公表された丸め幅±30秒以内で、
食分と遮蔽率も表示桁で一致する。

### 2026-03-03 月食

NASAは最大を11:34:52 TD、半影を含まない本影食分を1.151と公表する。
2026年のTT−UTC 69.184秒を差し引いた比較UTCは11:33:42.816である。

| 項目 | アプリ計算 | NASA換算値 | 差 |
| --- | ---: | ---: | ---: |
| 最大 | 11:33:42.903 UTC | 11:33:42.816 UTC | +0.087秒 |
| 本影食分 | 1.151110 | 1.151 | +0.000110 |

月食の影境界は地球大気によって物理的にぼける。数値上一致しても、肉眼での
開始・終了を同じ精度で観測できるという意味ではない。

## 恒星掩蔽の精度区分

月による恒星掩蔽は、3.0等級より明るい星（V≤3.0）かつ黄道付近の
BSC5P 25星を対象にする。
候補索引ではIOTA掲載の2017-03-05 Aldebaran接食を含むことを確認している。
局地solverはDE442sの月、BSC5Pの位置・固有運動・視差・視線速度、WGS84地点、
IERS EOPから潜入・出現を求める。

IOTAが紹介するMississaugaのLionhead Golf Club Road付近
（北緯43.638145°、西経79.789429°の近似地点、標高200 m）は平均月縁の
接食境界に近い。初期の球面月縁解では潜入04:16:27.970 UTC、最接近
04:16:43.069 UTC、出現04:16:58.185 UTCだったが、現在は発生を断定せず
`boundaryUncertain=true`として最接近だけを示す。実観測映像には月面の山谷による
複数回の明滅があり、この保守的扱いと整合する。この照合は日付・地域・短時間の
接食形状の確認であり、公開された各観測局の測地座標と個別接触時刻に対する
秒精度の照合ではない。

別の非接食ケースとして、同日のNew YorkについてIOTA由来の都市表は潜入
04:10 UTC、出現04:31 UTCを分単位で掲載している。Swiftの局地solverは潜入
04:10:30.030、最接近04:21:05.748、出現04:31:31.975 UTCとなり、掲載分の
先頭からそれぞれ+30.03秒、+31.98秒だった。公開値の丸め幅内で一致するが、
この比較だけから秒単位の絶対誤差は確定しない。

境界帯は、月地形±11 km、DE442s月位置係数の量子化約24.5 m、BSC5Pの
位置分解能2.5″、既知の観測地点水平精度を共分散なしの保守的な線形和として
構成する。平均月距離では約8.42″、月面付近で約15.7 kmに相当する。
数値求根用epsilonとは分離し、浅い掩蔽と近傍ミスの両側を同じように
`boundaryUncertain=true`とする。この物理境界フラグは地平線可視性と独立である。
最接近しか確定できない場合も、その時点が地平線上なら`partly-visible`、
地平線下なら`below-horizon`を別に返す。したがって、境界付近というだけで
「見える現象」へ分類されることはなく、地平線下フィルターも幾何高度だけで動く。

ただし初版には次がない。

- Gaia級の恒星位置と共分散
- 月面の山・谷を表す月縁地形プロファイル
- 接食に必要な観測点の測地精度と局地地形
- 共通パイプラインでの太陽光偏向

このため恒星掩蔽は一律に「参考計算」と表示し、望遠鏡観測の秒単位計画や
接食限界の判定には使わない。平均月縁の内部求根がミリ秒まで収束しても、
入力データの不確かさを超える精度は主張しない。

## 接触位置角

日食・月食・恒星掩蔽の接触または最接近には、CIRS接平面で天の北を0°、
東回りを正とする位置角を表示する。WebとmacOSは同じ幾何fixtureを読み、
日食と月食はUSNO公表例とも照合する。平均月縁と滑らかな地球影から得た
幾何学的な方向であり、月縁の山谷やBaily's beadsを再現する値ではない。
定義、接触ごとの基準円盤、独立照合値は
[`eclipse-contact-position-angles.md`](eclipse-contact-position-angles.md)
を参照する。

## 任意UTCの相対配置

連続シミュレーションは、接触時刻の画面座標を線形補間しない。WebとmacOSは
日食、月食、恒星掩蔽について、指定したUTCごとに既存solverと同じ内部sample
経路を呼び、DE442s、UTC／TT／TDB／UT1、IERS EOPまたは明示したfallback、
WGS84観測者、精密星表を再評価する。任意sampleには接触phaseを持たせず、
画面でもC1、最大、潜入などではなく「指定時刻」と表示する。

手動scrubと概要再生の範囲は、最初と最後の確定接触の閉区間である。
境界不確実性により最大／最接近しか確定できない現象は、根拠のない開始・終了を
作らず静止図だけを示す。各sessionはDE442sの光行時間reserve込み安全範囲と
候補探索範囲を交差し、範囲外のUTC、非有限UTC、現象種別または掩蔽対象HRの
不一致を計算前に拒否する。

画角は区間端、全接触、最大／最接近に加え、日食120秒、月食180秒、
恒星掩蔽60秒を目安とする物理sample gridから一度だけ決める。Webはその角度
extentへ4%の余白を加え、macOSも固定transformの余白を使う。表示フレームは
grid間の画面座標を補間せず、要求UTCを改めて物理計算する。このgridは描画範囲を
安定させるためのもので、月面地形、Baily's beads、地球影の非円形構造、
BSC5Pにない星表共分散を追加するものではない。

年次予報の直近3結果LRUにはruntime samplerを保存しない。暦providerとEOP
snapshotを保持するclosureは選択中イベント1件のsessionだけに置き、選択変更時に
取消・破棄する。時刻sample cacheはWeb 64件、macOS 32件以下に制限するため、
複数年の予報cacheがevict済みDE442s chunkを間接的に保持し続けることはない。

`shared/fixtures/event-physical-samples.v1.json`は、DUT1=0秒、xp=yp=0、
楕円体高11 m、大気差なしを明示し、日食・月食・恒星掩蔽それぞれの最大付近と
接触区間内の計6時刻を固定する。WebとmacOSは太陽・月・対象星の高度・方位・
角半径・距離と地球影を同じfixtureから検査する。両runtime間の許容差は角度
2×10⁻¹² rad、距離10⁻⁵ kmであり、画面pixelはfixtureへ含めない。この一致は
同じモデルの実装parityであり、月縁地形や星表誤差に対する外部精度保証ではない。

## 再現方法

自動テストは
`apps/web/src/domain/events/eventForecast.integration.test.ts`、
任意UTCの両runtime parityは
`apps/web/src/domain/events/eventPhysicalSamples.parity.test.ts`と
`apps/macos/Tests/PlanetariumCoreTests/EventPhysicalSampleParityTests.swift`、
年端coverage parityは
`apps/web/src/domain/events/eventForecastYearCoverage.parity.test.ts`と
`apps/macos/Tests/PlanetariumCoreTests/EventForecastYearCoverageParityTests.swift`、
候補生成検証は`script/build_event_candidates.mjs`にある。独立参照は次の
NASA/GSFC資料を使用する。

- https://eclipse.gsfc.nasa.gov/SEcirc/SEcircEU/LondonGBR2.html
- https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html
- https://eclipse.gsfc.nasa.gov/SEbeselm/SEbeselm2001/SE2026Aug12Tbeselm.html
- https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html
- https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html
- https://eclipse.gsfc.nasa.gov/SEhelp/uncertainty2004.html
- https://occultations.org/publications/rasc/2025/nam25grz.htm
- https://science.nasa.gov/photojournal/highest-point-on-the-moon/
- https://vimeo.com/209855792
- https://skyandtelescope.org/observing/aldebaran-occultation-march-4-2017/
