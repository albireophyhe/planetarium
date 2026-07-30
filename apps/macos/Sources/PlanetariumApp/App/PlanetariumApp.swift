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

    @State
    private var eventStore = EventForecastStore()

    var body: some Scene {
        WindowGroup("Planetarium", id: "main") {
            ContentView(
                store: store,
                eventStore: eventStore
            )
                .frame(minWidth: 980, minHeight: 680)
                .preferredColorScheme(.dark)
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
