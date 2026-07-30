# Planetarium 改訂実装計画

- 作成日: 2026-07-29
- 状態: 実装完了、改善ループ50回完了
- 根拠: `docs/product/user-stories.md`

## 1. 完成像

初回表示は東京の現在時刻です。中央の全天円に、地平線上の恒星、主要星座線、北・東・南・西、太陽高度に基づく昼・薄明・夜を表示します。画面横または下の一覧から星を検索・選択でき、Canvasを直接操作しなくても同じ情報へ到達できます。

起動時に位置権限、自動再生、音、全画面表示、強制チュートリアルは行いません。

## 2. 実装するMust

### 共通ドメイン

- UTC、東経正、J2000.0、方位角は北0度・東回りを固定する。
- J2000から観測日への歳差、赤道座標から地平座標、天頂中心の投影を実装する。
- 太陽の概算位置と薄明区分を実装する。
- 再配布可能な肉眼星表、主要な固有名、限定した星座線を同梱する。
- JSON Schema、データ出典、共有テストフィクスチャを正本にする。

### 利用体験

- 東京・現在時刻を権限なしで即時表示する。
- 都市プリセット、明示操作の現在地、検証付き緯度経度入力を提供する。
- 観測地点のタイムゾーンを表示し、日付・時刻を編集できる。
- 星をCanvasと検索可能な一覧の両方から選択する。
- 選択した星の名称、等級、高度、方位と、折りたたんだ赤経・赤緯を表示する。
- 「いま」と「表示をリセット」を別操作にし、地点・日時を意図せず失わない。
- 星座線、名称、地平線上だけの一覧を切り替える。
- 昼・薄明・夜と、「幾何学的に地平線上」の注意を表示する。
- 読み込み・位置・入力・描画の失敗を空白画面にせず復旧手段とともに表示する。

### アクセシビリティとプライバシー

- Webは操作可能なDOM一覧、macOSはSwiftUI一覧をCanvasと同期する。
- キーボードで地点、日時、検索、星選択、レイヤー、リセットを操作できる。
- 200%表示、大きな文字、コントラスト、reduced-motionを考慮する。
- 正確な位置を既定で永続保存せず、位置座標を外部へ送信しない。

## 3. 初回実装から外すもの

- 月、自動時間再生、オフライン再読込はShouldとして改善ループで判断する。
- 惑星、コンパス追従、授業プリセットはCould。
- 天候、光害、障害物、望遠鏡、衛星、アカウント、同期、共有はWon't。

## 4. リポジトリ構成

```text
.
├── Package.swift                    # macOSのSwiftPM入口
├── apps/
│   ├── macos/
│   │   ├── Sources/
│   │   │   ├── PlanetariumApp/
│   │   │   └── PlanetariumCore/
│   │   └── Tests/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── domain/
│       │   ├── features/
│       │   └── ui/
│       ├── public/
│       ├── vite.config.ts
│       └── wrangler.jsonc
├── shared/
│   ├── catalog/
│   ├── fixtures/
│   ├── schema/
│   └── swift/                       # Bundle.moduleへの小さな入口
├── script/
│   ├── build_and_run.sh
│   ├── doctor.mjs
│   └── validate_data.mjs
├── docs/
└── .github/workflows/ci.yml
```

UIと描画は各プラットフォームでネイティブ実装し、データ、仕様、期待値を共有します。SwiftPMの共有ターゲットは`shared/`をresource bundleとして読み、Webは同じJSONをビルドに取り込みます。

## 5. 実装順

1. **再現可能な基盤**
   Node 24 LTS、npm lockfile、SwiftPM、ルート検証、CI、Cloudflare Static Assets設定。

2. **共有契約**
   星表、星座線、都市、schema、出典、テストベクトル、データ検証。

3. **天文コア**
   ユリウス日、恒星時、歳差、地平座標、太陽、薄明、投影をTypeScriptとSwiftで実装。

4. **Webの最小縦切り**
   東京・現在、全天円、方位、一覧、選択、詳細、リセット。

5. **Webの基本入力**
   都市、現在地、緯度経度、日時、タイムゾーン、入力エラー。

6. **macOSの最小縦切り**
   `WindowGroup`の星図、ネイティブサイドバー／インスペクタ、ツールバー、メニュー、同じ基本入力。

7. **アクセシビリティと堅牢化**
   キーボード、読み上げ、大きな文字、reduced-motion、エラー状態、プライバシー説明。

8. **検証**
   共有数値テスト、両ビルド、Webのデスクトップ／モバイル視覚QA、Macアプリバンドル起動と画面確認。

## 6. 品質ゲート

- `npm run check`と`swift test`が成功する。
- SwiftとTypeScriptの共有ケースは天空上の角距離で一致する。
- Web初期アセットは自己ホスト日本語フォントを含め768KiB gzip・12ファイル以下、
  最大初期JavaScriptは600KiB raw以下、全JavaScriptの各ファイルは
  720KiB raw以下、3D遅延chunkは160KiB gzip以下とする。現行buildは
  初期12ファイル719.6KiB gzip、最大初期JavaScriptの`catalog-v1`は
  523.0KiB rawである。
- 星図は状態変化時だけ再描画し、非表示時に時間ループを継続しない。
- Webの2D Canvasと3D rendererは共通の純粋関数でdevice pixel ratioを
  1–2倍へ制限し、非有限値、0、負値は1倍へ安全に戻す。
- 時刻再生中に連続変化する太陽高度はlive regionへ入れず、低頻度の
  計算状態と時刻仮定だけを`aria-live="polite"`で通知する。
- 選択星の軌跡はCanvasの説明と凡例を維持しつつ、再生tickごとの
  準備中／13点を`status`やlive regionとして反復通知しない。
- 位置権限を拒否しても東京・都市・手入力が使える。
- Web 200%と狭い画面、macOS大きな文字で主要操作が欠けない。
- Web 3Dは北・東・南・西・天頂・天底のDOMラベルをカメラへ追従させ、
  240px幅でも方向・reset・zoom操作が天球中心を塞がず横overflowを出さない。
- 重大なブラウザコンソールエラー、Swiftクラッシュ、白紙エラー状態がない。
- データ出典、精度、可視性、プライバシーの説明がアプリまたは文書から到達できる。

## 7. 改善ループ

初回実装後は`docs/progress/iterations.md`へ、各回の観察、変更、検証、残るリスクを記録します。優先順は次の通りです。

1. 正しさと誤解防止
2. 主要操作の失敗
3. アクセシビリティ
4. レスポンシブ／Macネイティブ操作
5. 性能・信頼性
6. 見た目と微細な操作感
7. Should機能

停止条件は、50回完了またはゴール累計16時間超過の早い方です。

## 8. 実施結果

- Mustの共通天文ドメイン、同梱データ、Web版、macOS版を実装した。
- WebはCloudflare Workers Static Assetsのbuildとdeploy dry-run、macOSはSwiftPMから`.app`の組立・署名・起動検査まで自動化した。
- 初期計画後の多視点監査で追加した、薄明、タイムゾーン、都市、検索一覧、向き、復旧可能なエラー、位置プライバシー、性能予算を品質ゲートへ反映した。
- 初回時点でShouldだった時間再生は、第2フェーズで明示開始・順逆・速度・
  reduced-motion対応の観測時計として実装した。月とオフライン再利用は引き続き未実装。
- WebはReact起動前から、場所と日時の星空を表示するアプリであることと、
  東京・現在時刻を準備中であることを、第三者資産なし・同一originの
  `boot-shell.css`を使うCSP互換のshellで示す。React起動後は通常画面へ置換し、
  JavaScript無効時は`noscript`で必要条件と同一originの再読み込み導線を示す。
  成果物検査で文言、stylesheet参照、source/distのbyte一致、`noscript`と
  安全に`index.html`へ解決するhrefを守る。
- WebはVite 8 / Rolldownの`codeSplitting`でv1星表、React、その他vendorを
  分離した。Vite build表示でmainを846.6kBから116.69kBへ縮小し、
  `catalog-v1`は535.57kB（予算検査では523.0KiB raw）とした。本番相当の
  WranglerとCSPでReactへの置換、precisionDataとEOPの取得、新規console errorが
  ないことを確認した。生成`.assetsignore`の`.wrangler`除外も成果物検査で固定した。
- Webの2D/3Dは`skyDevicePixelRatio`を共有し、通常の鮮明さを保ちながら
  4倍等の高密度表示でもbacking storeとGPUメモリが二乗増加し続けないよう
  最大2倍にした。異常値は1倍へ戻す純粋関数テストで固定した。
- Webの薄明表示は、再生中に最大12Hzで変わる太陽高度をlive regionから外し、
  非頻繁な計算状態と時刻系の仮定だけを`polite`に分離した。
- 選択星の軌跡は非同期再計算のたびに準備中／13点を通知せず、凡例とCanvasの
  `aria-describedby`は保持し、有効化はcheckbox自体の状態で伝える。
- Web 3Dの方向表示を北・東・南・西・天頂・天底へ揃え、quaternionと
  OrbitControlsに追従するDOMラベルにした。球中心より背面はopacity 0.44、
  天頂・天底は上下offsetで重なりを避ける。300px以下では回転4方向・reset・
  zoomを横一段にし、240pxでは28px操作と横overflow 0を実ブラウザーで確認した。
- 第2フェーズの精密計算、3D天球、タイポグラフィは
  `docs/plans/precision-interaction-plan.md`を正本とする。
- 実装後の観察、変更、検証、残るリスクは`docs/progress/iterations.md`へ連番で記録する。
- 実Cloudflare公開、Developer ID署名・公証、物理環境でのVoiceOver/PWA確認は
  実装完了とは別の配布ゲートであり、未実施のまま完了扱いにしない。
