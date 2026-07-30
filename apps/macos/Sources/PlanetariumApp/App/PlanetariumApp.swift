import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        AppLog.ui.info("application launched")
    }

    func applicationShouldSaveSecureApplicationState(_ app: NSApplication) -> Bool {
        false
    }

    func applicationShouldRestoreSecureApplicationState(_ app: NSApplication) -> Bool {
        false
    }
}

@main
struct PlanetariumApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self)
    private var appDelegate

    @State
    private var store = SkyStore()

    var body: some Scene {
        WindowGroup("Planetarium", id: "main") {
            PlanetariumWindowRoot(store: store)
        }
        .defaultSize(width: 1_360, height: 860)
        .windowResizability(.contentMinSize)
        .commands {
            PlanetariumCommands(store: store)
        }

        Settings {
            SettingsView(store: store)
        }
    }
}

/// Event forecasts retain decoded ephemeris data and view-owned scene leases.
/// Keep that mutable resource graph inside one WindowGroup instance so closing
/// or changing mode in one window cannot tear down another window's scene.
@MainActor
private struct PlanetariumWindowRoot: View {
    let store: SkyStore

    @State
    private var eventStore = EventForecastStore()

    var body: some View {
        ContentView(
            store: store,
            eventStore: eventStore
        )
        .frame(minWidth: 980, minHeight: 680)
        .preferredColorScheme(.dark)
    }
}
