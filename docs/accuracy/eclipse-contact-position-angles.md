# 食・掩蔽の接触／最接近位置角

- 更新日: 2026-07-30
- 対象: Web / macOS の日食・月食・恒星掩蔽局地予報
- 単位: 度（画面表示）、ラジアン（内部値）

## 表示規約

接触位置角は、基準円盤の中心を通る CIRS（Celestial Intermediate
Reference System）接平面上で定義する。CIRS の z 軸である天の中間極
（CIP）側を北 0°、CIRS 赤経が増える東を 90° とし、東回りに 0° 以上
360° 未満へ正規化する。この定義は
NASA/GSFC と USNO が日食の位置角に用いる「太陽面の北点から東回り」という
規約、および USNO の月食図が用いる「月面の北点から東回り」という規約に
合わせている。

画面では日食・月食の接触が成立する各時刻だけに位置角を示し、食の最大には
表示しない。最大時刻は円盤同士の最接近であり、接触点ではないためである。
恒星掩蔽は点状の恒星方向を月面上の位置として扱うため、潜入・最接近・出現に
月中心から恒星方向への位置角を示す。物理境界帯内で潜入・出現を断定できない
場合は、最接近の方向だけを示す。

## 計算式

基準円盤中心への単位方向を `c`、もう一方の中心への単位方向を `o`、
CIRS の北極を `k = (0, 0, 1)` とする。基準中心の接平面上に、北と東の
単位基底を次のように作る。

```text
n = normalize(k - (k · c)c)
e = normalize((-c_y, c_x, 0))
r = o - (o · c)c
P = atan2(r · e, r · n) mod 2π
```

接触点がもう一方の中心と反対側にある内接では、`P + π` を
`[0, 2π)` に正規化する。基準中心が CIRS 極そのもの、または二方向が一致して
接平面上の向きが定まらない場合、零ベクトル、非有限入力では値を返さない。

各接触への適用は次のとおり。

| 現象 | 接触 | 基準円盤 | 接触点の向き |
| --- | --- | --- | --- |
| 日食 | C1 / C4 | 太陽 | 月中心側 |
| 金環日食 | C2 / C3 | 太陽 | 月中心側 |
| 皆既日食 | C2 / C3 | 太陽 | 月中心と反対側 |
| 月食 | P1 / P4 / U1 / U4 | 月 | 地球影中心側 |
| 皆既月食 | U2 / U3 | 月 | 地球影中心と反対側 |
| 恒星掩蔽 | 潜入 / 最接近 / 出現 | 月 | 恒星方向 |

月食の地球影中心方向には、同じ時刻の地心視 CIRS 太陽方向の反対向きを使う。
日食には観測地点からの地形視 CIRS 太陽・月方向を使う。

## 検証

Web と macOS は
`shared/fixtures/eclipse-contact-position-angles.v1.json` の同じベクトルを
読み、北・東・南・西、任意方向、180°反転、退化方向を
`1e-9°` の数値許容差で固定する。

恒星掩蔽も同じ関数と規約を使い、実solverで潜入・最接近・出現の有限値と、
物理境界帯内では最接近だけを返す契約を両版で検証する。公開資料に同じ地点・
同じ平均月縁モデルの角度値がないため、掩蔽の絶対角度についてUSNO照合済みとは
主張しない。

実現象では次の独立資料と照合する。

- 2024-04-08 Syracuse の皆既日食: USNO Solar Eclipse Computer が公表する
  C1 233.7°、C2 109.5°、C3 178.4°、C4 54.6°に対して、Web / macOS
  とも各 0.5°以内をテストする。
- 2026-03-03 の皆既月食: USNO 月食図が公表する U1 96.2°、U4
  320.2°に対して、Web / macOS とも各 0.5°以内をテストする。

0.5°は異なる暦・影・地球回転モデルを含む回帰検査の許容差であり、観測上の
誤差保証や信頼区間ではない。

## 適用限界

日食と恒星掩蔽は平均球面月縁、月食は Danjon 法による滑らかな半影・本影を使う。
したがって位置角は現在のモデルが求めた幾何学的接触点の方向であり、月面の
山谷、中心像と質量中心の差、Baily's beads、地球大気でぼける影縁の見え方を
再現しない。特に精密な接触観測、月縁プロファイル補正、接食限界の判定には
使用しない。

参照:

- NASA/GSFC, Solar Eclipse Local Circumstances:
  https://eclipse.gsfc.nasa.gov/SEmono/reference/locircT.html
- USNO, Solar Eclipse Computer:
  https://aa.usno.navy.mil/data/SolarEclipses
- USNO, Explanation of Lunar Eclipse Diagrams:
  https://aa.usno.navy.mil/downloads/eclipses/lun_ecl_expl_web.pdf
- USNO, 2024-04-08 Syracuse local circumstances:
  https://aa.usno.navy.mil/calculated/eclipse/solar?eclipse=12024&height=0&label=&lat=43.1029&lon=-76.2079&submit=Get+Data
- USNO, 2026-03-03 lunar-eclipse diagram:
  https://aa.usno.navy.mil/downloads/eclipses/eclipse_moon_2026_03.pdf
