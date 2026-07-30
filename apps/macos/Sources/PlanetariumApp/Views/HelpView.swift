import SwiftUI

struct HelpView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Planetarium ヘルプ")
                    .font(SkyTypography.brand)
                Spacer()
                Button("閉じる") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
            }
            .padding(20)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    helpSection(
                        title: "星図の読み方",
                        systemImage: "circle.grid.cross",
                        text: "2Dでは円の中央が天頂、外周が地平線で、北が上、東が右です。3Dでは北・東・南・西・天頂・天底のラベルが天球の向きに追従します。ドラッグまたは矢印ボタンで回転し、ピンチ、＋／−ボタン、キーボードで75〜250%に拡大縮小できます。地平線下と背面の星は控えめに表示します。向きと倍率は同時にリセットできます。どちらも星図をクリックするか、検索可能な一覧から星を選択できます。"
                    )

                    helpSection(
                        title: "時間再生",
                        systemImage: "play.circle",
                        text: "再生はボタンを押した時だけ始まります。逆方向・順方向と、1×、60×、600×、3600×、86400×を選べます。1900年または2100年へ達すると自動停止します。macOSの「動きを減らす」が有効な場合は静止モードになります。"
                    )

                    helpSection(
                        title: "日食・月食・恒星掩蔽予報",
                        systemImage: "sun.and.horizon",
                        text: "サイドバーを「現象」へ切り替えると、選んだ年の全球候補から、現在の観測地点で経過の一部または全部が地平線上となる日食・月食・月による明るい恒星の掩蔽を端末内で計算します。前年・翌年、または空の観測日時と同じ年へ移動できます。予報の選択だけでは空の日時を変えません。「最大時刻を空に表示」または「最接近時刻を空に表示」、各接触の時刻ボタンを押した場合だけ時間再生を停止して日時を変更し、「元の観測日時へ戻す」で復元できます。"
                    )

                    helpSection(
                        title: "現象予報の精度と安全",
                        systemImage: "exclamationmark.triangle",
                        text: "日食・月食・恒星掩蔽は同梱したJPL DE442s暦、IAU 2006/2000B、WGS84、利用可能な範囲ではIERS DUT1・極運動を用いて計算します。月縁は平均半径で、月の山谷によるベイリー・ビーズや掩蔽の瞬間的な明滅は再現しません。恒星掩蔽はBSC5Pの明るい恒星を対象にした参考予報で、潜入・最接近・出現、対象星の高度・方位、月縁位置角を表示します。平均月縁の物理境界帯内では掩蔽の発生を確定せず、候補として最接近時刻だけを示します。WGS84楕円体高は都市では0 m、手入力では指定値、端末測位では取得できたOSの値を使い、取得できない場合は0 mとします。OSから水平精度を取得できた場合だけ境界幅へ加え、都市・手入力は測位精度値を持ちません。大気差、地形、建物、雲、視程は含みません。各予報のInspectorに前提、不確かさ、出典を表示します。太陽を肉眼や光学機器で直接見ないでください。皆既日食でも、皆既中以外は規格に適合した日食観察用フィルターが必要です。"
                    )

                    helpSection(
                        title: "選択星の軌跡",
                        systemImage: "point.topleft.down.to.point.bottomright.curvepath",
                        text: "既定はOFFです。ONにすると、選択した1星だけを現在の観測時刻の前後3時間、30分間隔、最大13点で精密モデルv2により再計算します。各点の日時ごとにDUT1と極運動を検索し、年周視差、年周・日周光行差、大気差の設定も現在の星図と同じにします。小さい点から大きい点へ過去、現在、未来の順で、2Dの過去側は破線です。2Dは地平線下を表示せず、3Dは地平線下と天球の裏側を薄く表示します。1900年・2100年の対応期間端では範囲内の点だけに短縮します。軌跡自体にアニメーションはありません。"
                    )

                    helpSection(
                        title: "「地平線上」の意味",
                        systemImage: "mountain.2",
                        text: "精密モデルv2の幾何高度が0°以上という判定です。大気差をONにしても補正対象の最低幾何高度は5°以上なので、地平線上／下の判定は変わりません。昼光、薄明、天候、光害、地形、建物、視力は含まれず、肉眼で見えることを保証しません。"
                    )

                    helpSection(
                        title: "年周視差（近似）",
                        systemImage: "arrow.left.and.right.circle",
                        text: "正の星表視差値がある星だけ、地球の公転に伴う見かけの方向変化を計算します。既定の観測者位置には、共有するVSOP2000由来200項の太陽中心地球暦をproxyとして使います。この暦はTTをTDBのproxyとして評価し、厳密な太陽系重心から太陽までの変位と、地球中心から実観測地点までの日周視差は含みません。視線速度が未収録でも距離を捨てず、0 km/sを仮定して年周視差を適用します。その場合は未知の遠近加速度を含みません。視差値がない星は「変位なし」ではなく「計算不可」です。この近似年周視差だけで精密観測や望遠鏡導入の精度を保証するものではありません。"
                    )

                    helpSection(
                        title: "太陽重力光偏向（近似）",
                        systemImage: "sun.max",
                        text: "恒星には、太陽の重力による光の曲がりをSOFAのld・ldsun由来の遠方天体向けベクトル式で適用します。既定の太陽—観測者幾何には、共有するVSOP2000由来200項の太陽中心地球暦を使い、計算APIでは呼び出し側が方向と距離を指定できます。太陽近傍の特異化を避けるSOFA由来のリミターを使いますが、これは数値安定化のための範囲制限であり、太陽面による掩蔽、強重力場の厳密計算、惑星による光偏向は含みません。太陽自身の表示方向には自己偏向を適用しません。切り詰めた暦と星表の制約があるため、サブ秒角精度や望遠鏡導入を保証しません。"
                    )

                    helpSection(
                        title: "日周光行差（WGS84）",
                        systemImage: "globe",
                        text: "地球と一緒に自転する観測者の東向き速度による見かけの方向変化を、SOFAのsplit-at-CIRS一次式で計算します。WGS84楕円体高は都市では0 m、手入力では指定値、端末測位では取得できたOSの値を使い、取得できない場合は0 mとします。東京での最大変位は約0.260秒角です。これは地球上の観測地点の変位による日周視差とは別の補正です。恒星の既定年周視差は日周視差を含みませんが、太陽の水平位置にはWGS84地点変位による最大約8.8秒角級の日周視差を別途適用します。"
                    )

                    helpSection(
                        title: "地球姿勢（DUT1・極運動）",
                        systemImage: "clock.badge.checkmark",
                        text: "UT1−UTC（DUT1）と極運動xp・ypには、2026年7月31日取得のIERS Bulletin A finals2000Aスナップショットを使います。収録範囲は1973-01-02〜2027-08-07 UTCで、2026-07-30までは観測値、翌日以降は将来の更新で変わり得る予測値です。DUT1は00:00 UTCの日次値を線形補間し、うるう秒による約1秒の段差を前日へsmearせず、翌日00:00で表値へ切り替えます。xp・ypは公式SOFA例と同じ4点Lagrange補間です。DUT1と極運動の観測／予測区分・公表誤差は独立して扱います。公式formatは誤差列を単にerrorと定義しており、1σとは仮定しません。範囲外またはデータを検証して読み込めない場合はDUT1=0秒、xp=yp=0の近似へ戻り、画面にその状態を表示します。時角の最大約13.5秒角は、現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安です。xp/yp=0による方向差も同梱履歴では最大約0.6秒角です。1972年以前はTAI−UTC=0秒、将来は既知最後の37秒を仮定するUTC近似を含みます。読込・検証・適用に失敗した場合はInspectorの「IERSデータを再読み込み」で再試行できます。"
                    )

                    helpSection(
                        title: "太陽高度と昼夜・薄明表現",
                        systemImage: "sun.horizon",
                        text: "太陽表示は恒星と同じ観測時刻・DUT1・極運動を持つ精密モデルv2の計算コンテキストを使います。共有するVSOP2000由来200項の太陽中心地球位置から地心の太陽方向を求め、その位置の解析微分を使った年周光行差、歳差章動、GAST、極運動を順に反映します。水平位置では太陽距離で尺度化したITRSベクトルからWGS84観測地点を減算して日周視差を加え、その後に日周光行差を適用します。見かけ赤経・赤緯は地心値のままです。地球暦ではTTをTDBのproxyとし、太陽系重心に対する太陽の速度は年周光行差へ加えていません。画面の太陽高度と昼夜・薄明の色分けには、設定にかかわらず大気差を加えない幾何高度を使います。厳密な太陽系暦、太陽視半径、地形や建物による遮蔽、現地大気は含まれないため、日の出・日没や薄明の厳密な時刻計算には使用できません。"
                    )

                    helpSection(
                        title: "精密モデルv2と大気差",
                        systemImage: "scope",
                        text: "既定は大気差OFFで、真空中の幾何高度を表示します。ONへ切り替えると、気圧1013.25 hPa・気温10°C・相対湿度50%・観測波長0.55 µmを仮定した標準大気を幾何高度5°以上へ適用します。「大気差を詳しく設定」では、このセッションだけの気圧・気温・相対湿度・光学から近赤外（0.3〜2 µm）の観測波長と5〜30°の最低適用高度を手動入力できます。「適用」するまで星図は変わらず、有効性を検証した値を星図・選択星の軌跡・座標転記JSONへ同時に反映します。最低適用高度より低い空は大気の鉛直構造に敏感なため補正しません。手動入力でも天候の時間変化や鉛直構造を再現するものではありません。恒星位置にはBSC5P J2000.0 FK5座標をSOFA由来のJ2000回転・フレームスピンでHipparcos/ICRSへ接続し、固有運動、近似年周視差、太陽重力光偏向、近似年周光行差、IAU 2006 Fukushima–Williams歳差、IAU 2000B 77項章動、IERS DUT1を反映した見かけ恒星時、IERS極運動、WGS84日周光行差の順で適用します。極運動はGASTからTIRSへ回した後、SOFA由来のTIO locator s′とpom00相当の行列でITRSへ変換して地点のENU座標へ移します。日内の極運動潮汐、惑星による光偏向、恒星の日周視差は未適用です。太陽の水平位置だけはWGS84地点変位による日周視差を含みます。IERS収録期間内の「概ね1〜数秒角級」は、BSC5Pの格納分解能から見た真空中の通常目安で、全恒星の実測精度を保証する値ではありません。大気差ON時の表示高度は別です。BSC5PのFK5ゾーン誤差、共有地球暦の200項への切り詰め、TTをTDBのproxyとすること、太陽系重心に対する太陽速度の省略も精度を制限するため、サブ秒角精度は主張しません。この説明は通常の恒星星図に関するもので、食予報は別のDE442s計算経路を使います。詳細画面の座標転記は、座標系と大気差設定を確認した手動導入・機材設定比較の実験的な補助情報です。無人の自動導入・追尾、掩蔽の成立判定、測地、航法の唯一の入力には使用しないでください。"
                    )

                    helpSection(
                        title: "プライバシー",
                        systemImage: "hand.raised",
                        text: "起動時に位置権限を求めません。「現在地」を押した場合だけmacOSへ許可を要求します。正確な座標、日時、検索語、選択した星は保存せず、外部サーバーへ送信しません。端末へ保存するのは、星座線、星の名前、選択星の軌跡、ナイトモード、大気差ON/OFFの5表示設定だけで、設定画面から消去できます。手動入力した気象値と入力元は保存せず、次回起動時に大気差がONなら標準大気へ戻します。星表と計算は端末内に同梱されています。"
                    )

                    VStack(alignment: .leading, spacing: 7) {
                        Label("データ", systemImage: "books.vertical")
                            .font(SkyTypography.heading)
                        Text("肉眼星は NASA HEASARC Bright Star Catalog (BSC5P)、固有名は IAU Working Group on Star Names を参照しています。星座線はこのアプリ用の簡略表現で、IAU公式境界ではありません。")
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack {
                            Link(
                                "NASA HEASARC",
                                destination: URL(string: "https://heasarc.gsfc.nasa.gov/W3Browse/catalog/bsc5p.html")!
                            )
                            Link(
                                "IAU星名一覧",
                                destination: URL(string: "https://exopla.net/star-names/modern-iau-star-names/")!
                            )
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("キーボード")
                            .font(SkyTypography.heading)
                        shortcut("⌘F", "星を検索")
                        shortcut("⌥← / ⌥→", "1時間戻す／進める")
                        shortcut("⌥Space", "時間再生／停止")
                        shortcut("⌘1 / ⌘2", "2D星図／3D天球")
                        shortcut("⇧⌘T", "選択星の軌跡")
                        shortcut("⌃⌘矢印", "3D天球を回転")
                        shortcut("⌘＋ / ⌘−", "3D天球を拡大／縮小")
                        shortcut("⌘0", "3D天球の向きと倍率をリセット")
                        shortcut("⇧⌘N", "現在時刻へ")
                        shortcut("⌥⌘R", "表示をリセット")
                        shortcut("⌥⌘I", "インスペクタ")
                    }
                }
                .padding(22)
            }
        }
        .frame(width: 640, height: 700)
    }

    private func helpSection(
        title: String,
        systemImage: String,
        text: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(title, systemImage: systemImage)
                .font(SkyTypography.heading)
            Text(text)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func shortcut(_ keys: String, _ action: String) -> some View {
        HStack {
            Text(keys)
                .font(SkyTypography.data)
                .frame(width: 100, alignment: .leading)
            Text(action)
                .foregroundStyle(.secondary)
        }
    }
}
