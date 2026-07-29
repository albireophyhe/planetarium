import OSLog

enum AppLog {
    static let ui = Logger(
        subsystem: "com.yjhe.Planetarium",
        category: "ui"
    )
    static let location = Logger(
        subsystem: "com.yjhe.Planetarium",
        category: "location"
    )
}
