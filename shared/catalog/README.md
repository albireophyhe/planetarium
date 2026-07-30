# 共有天文データ

## 恒星

`bright-stars.v1.json`は、NASA HEASARCのBright Star Catalog（BSC5P）を、次の固定クエリで変換した生成物です。

- 対象: `Vmag <= 6.5`
- 主キー: Harvard Revised（HR）番号
- 座標: J2000.0、ラジアン
- 列: HR、HD、赤経、赤緯、V等級、B−V、カタログ内名称、スペクトル型
- 生成: `npm run data:fetch`
- 再現性: `bright-stars.lock.v1.json`に、HR昇順の`stars`配列を
  `JSON.stringify`したSHA-256、件数、先頭・末尾HR、元レスポンスSHAを固定
- 検証: `npm run data:validate`がJSON Schema、意味的不変条件、ロックを照合
- 出典: https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html
- NASA Open Data: https://data.nasa.gov/dataset/bright-star-catalog
- 取得日と元レスポンスのSHA-256はJSON内に記録

NASA Open Data Portalはこのデータセットをpublic accessかつ米国政府著作物の案内へ関連付けています。BSC5PはYale Bright Star Catalog由来でもあるため、商用再配布を行う公開リリース前には、HEASARCまたは原典権利者へ条件を再確認します。

### 恒星 v2 精密位置用列

`bright-stars.v2.json`はv1を置換せず、先頭8列を同値・同順序で保持した
並行版です。末尾へ次を追加します。

- `pmRaCosDecArcsecPerYear`: `cos(dec) × d(RA)/dt`、秒角/年
- `pmDecArcsecPerYear`: 赤緯方向の固有運動、秒角/年
- `parallaxArcsec`: 視差、秒角
- `radialVelocityKmPerSecond`: 太陽中心視線速度、km/s

原カタログReadMeは`pmRA`が投影固有運動
`cos(dec) × d(RA)/dt`であると明記しています。値はNASA HEASARCの
`pmra,pmdec,parallax,radvel`を元の単位で保存し、空欄だけを`null`にします。
負の測定視差は原値を保持しますが、距離計算には使用しません。

- 生成: `npm run data:fetch:v2`
- 再現性: `bright-stars.lock.v2.json`
- JSON Schema: `shared/schema/bright-stars-v2.schema.json`
- 出典: https://heasarc.gsfc.nasa.gov/W3Browse/catalog/bsc5p.html
- 項目規約: https://cdsarc.cds.unistra.fr/ftp/cats/V/50/ReadMe

### Web初期描画用の派生星表

`render-stars.v1.json`は、完全なv1星表からWeb版の初期描画に必要な行だけを
決定的に抽出した派生物です。完全なv2精密星表の非同期読み込みと配布契約は
変更しません。

- 選択: `Vmag <= 5`、または固有名・星座線の端点として参照されるHR
- 順序と列: `bright-stars.v1.json`と同じHR昇順・8列
- 生成: `npm run data:build:render`
- 再現性確認: `npm run data:check:render`
- 入力固定: 完全星表、固有名、星座線のSHA-256をartifactへ記録
- 出力固定: `render-stars.lock.v1.json`が末尾改行を除くcanonical JSONの
  SHA-256、件数、先頭・末尾HRを保持

## 固有名

`star-names.v1.json`は、肉眼でよく使う恒星のIAU英語名と、プロジェクトで用意した日本語表記の小さな対応表です。座標と等級は重複保持せずHR番号でBSC5Pへ結合します。

- IAU Working Group on Star Names: https://exopla.net/star-names/modern-iau-star-names/
- 日本語名は一般的なカタカナ表記

## 星座線

`constellations.v1.json`は、このアプリ用に限定して選んだ線分です。IAUが定める公式境界ではなく、星座の結び方に唯一の標準はありません。画面とヘルプでは「IAU公式星座線」と表現しません。

線分は無向辺で、見た目上の交差はグラフ上の接続点とは扱いません。各星座の
`componentCount`はこの規約で計算した連結成分数で、検証時に再計算します。

## 地点プリセット

`cities.v1.json`は観測地点選択用の概略的な都市中心座標です。緯度は北を正、
経度は東を正とし、小数点以下4桁以内で保持します。測量値ではありません。
IANAタイムゾーン識別子は、固定したNode.js環境で正規名であることを検証します。
