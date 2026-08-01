enum StarPositionAccuracySummary {
    static func text(
        hasBundledEarthOrientation: Bool
    ) -> String {
        if hasBundledEarthOrientation {
            return "真空中の位置精度の通常目安：概ね1〜数秒角級"
                + "です。全恒星の実測精度を保証する値では"
                + "ありません。地点・時計の誤差や、"
                + "大気差ON時の表示高度は別です。"
                + "詳しい前提は「計算モデルと制限」で確認できます。"
        }
        return "精度低下：地球回転データを利用できず近似中です。"
            + "真空中の条件付き目安として、時角差は最大約13.5秒角、"
            + "極運動による方向差は最大約0.6秒角です。"
            + "地点・時計の誤差や、大気差ON時の"
            + "表示高度は別です。詳しい近似条件は"
            + "「計算モデルと制限」で確認できます。"
    }

    static let fallbackDetails =
        "IERS収録外または未取得のため、DUT1=0秒・xp/yp=0近似を使います。"
        + "時角の最大約13.5秒角は、現行の整数うるう秒UTCを"
        + "前提にしたDUT1だけの条件付き目安です。"
        + "xp/yp=0による方向差も、同梱履歴では最大約0.6秒角です。"
        + "1972年以前はTAI−UTC=0秒、将来は既知最後の37秒を"
        + "仮定するUTC近似を含みます。"
}
