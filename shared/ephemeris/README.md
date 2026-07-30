# 共有地球暦

`truncated-earth-heliocentric.v1.json`は、Web版とmacOS版が既定で使う
太陽中心から地球への位置級数です。IAU SOFA ANSI C 2023-10-11の
`epv00`に含まれるVSOP2000由来の太陽→地球1,323項から、1900〜2100年の
寄与上限を基準に200項を決定論的に選びます。

## 再生成

公式配布物の`epv00.c`を用意し、次を実行します。

```sh
npm run data:build:ephemeris -- --source /path/to/epv00.c
npm run data:build:ephemeris -- --source /path/to/epv00.c --check
```

生成器は入力ファイルのSHA-256
`939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a`
を先に検査します。元archiveのSHA-256は
`d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2`
です。選定規則、元項数、保持項数、単位、BCRS向け回転行列もartifactと
JSON Schemaへ固定しています。

各項は`[amplitude, phase, frequency]`で、時刻
`t = (TT JD − 2451545.0) / 365.25`に対し
`amplitude × cos(phase + frequency × t)`として評価します。
位置は`S0 + t S1 + t² S2`、速度はその解析微分を365.25で割った
AU/dayです。TTをTDBのproxyとして使います。

## 精度と用途

未短縮SOFA `epv00`との1900-01-01 00:00〜2100-12-31 18:00・6時間刻み
293,656時点の独立比較では、太陽方向の差は光行差前で最大0.8324427秒角
（RMS 0.1756056秒角）、光行差後で最大0.8413076秒角
（RMS 0.1757668秒角）でした。共有SOFA fixtureでは、地球方向1秒角、
距離`0.000003 AU`、太陽の真赤道・真分点方向とENU方向2秒角を上限にします。

これは肉眼向け星図のための短縮暦です。この係数artifact自体は
SSB→太陽の位置・速度や観測地点の地心変位を含まず、地心の太陽状態だけを
供給します。最終の太陽水平位置では別途WGS84観測地点を減算して日周視差を
加えますが、測地、航法、食・掩蔽、望遠鏡制御には使えません。完全な制約は
[`docs/astronomy-model-v2.md`](../../docs/astronomy-model-v2.md)を参照してください。

## ライセンス

係数と評価手順はSOFA派生物です。PlanetariumはSOFAが提供または推奨する
ソフトウェアではありません。完全な派生物表示とSOFA Software Licenseは
[`shared/licenses/IAU-SOFA-derived-work-notice.md`](../licenses/IAU-SOFA-derived-work-notice.md)
にあります。
