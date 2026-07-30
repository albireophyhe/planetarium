enum StarPositionAccuracySummary {
    static func text(
        hasBundledEarthOrientation: Bool
    ) -> String {
        if hasBundledEarthOrientation {
            return "位置精度の目安：BSC5Pの格納分解能から見た"
                + "真空中の通常目安として、"
                + "IERS収録期間内では概ね1〜数秒角級"
                + "です。全恒星の実測精度を保証する値では"
                + "ありません。地点・時計の誤差や、"
                + "大気差ON時の表示高度は別です。"
        }
        return "位置精度の目安：IERS収録外または未取得。"
            + "DUT1=0秒・xp/yp=0近似を使います。"
            + "時角の最大約13.5秒角は、"
            + "現行の整数うるう秒UTCを"
            + "前提にしたDUT1だけの条件付き目安です。"
            + "xp/yp=0による方向差も、同梱履歴では"
            + "最大約0.6秒角です。"
            + "1972年以前はTAI−UTC=0秒、将来は"
            + "既知最後の37秒を仮定するUTC近似を含みます。"
            + "地点・時計の誤差や、大気差ON時の"
            + "表示高度は別です。"
    }
}
