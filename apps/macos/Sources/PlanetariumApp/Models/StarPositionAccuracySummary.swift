enum StarPositionAccuracySummary {
    static func text(
        hasBundledEarthOrientation: Bool
    ) -> String {
        if hasBundledEarthOrientation {
            return "位置精度の目安：星表の格納分解能から見て、"
                + "IERS収録期間内では概ね1〜数秒角級"
                + "（全恒星への保証値ではありません）。"
                + "これは星表・真空計算部分の目安で、"
                + "地点・時計・実際の大気との差は別です"
        }
        return "位置精度の目安：IERS収録外または未取得。"
            + "DUT1=0秒・xp/yp=0近似を使います。"
            + "現行の整数うるう秒UTCが維持される期間では、"
            + "DUT1だけで時角に最大約13.5秒角相当が"
            + "加わり得ます。"
            + "1972年以前と将来のUTC制度は"
            + "別の時刻系近似も含みます。"
            + "これは星表・真空計算部分の目安で、"
            + "地点・時計・実際の大気との差は別です"
    }
}
