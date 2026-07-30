import Foundation

enum TestFixtureData {
    static func data(
        at repositoryRelativePath: String,
        sourceFilePath: String = #filePath
    ) throws -> Data {
        let testFileURL = URL(fileURLWithPath: sourceFilePath)
        let repositoryRoot = testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return try Data(
            contentsOf: repositoryRoot.appendingPathComponent(
                repositoryRelativePath
            )
        )
    }
}
