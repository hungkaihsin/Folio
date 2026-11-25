import AppKit
import Foundation

let applicationIdentity = "com.danielhung.folio"
let installerFiles = FileManager.default

struct InstallationError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct InstallationResult {
    let application: URL
    let shortcut: Bool
    let warning: String?
}

func identity(at url: URL) -> String? {
    Bundle(url: url)?.bundleIdentifier
}

func installApplication(source: URL, applications: URL, desktop: URL, shortcut: Bool) throws -> InstallationResult {
    guard identity(at: source) == applicationIdentity,
          let sourceBundle = Bundle(url: source),
          let version = sourceBundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
          let executable = sourceBundle.executableURL,
          installerFiles.isExecutableFile(atPath: executable.path) else {
        throw InstallationError(message: "Open the installer from the Pageline disk image.")
    }
    try installerFiles.createDirectory(at: applications, withIntermediateDirectories: true)
    let destination = applications.appendingPathComponent("Pageline.app")
    let legacy = applications.appendingPathComponent("Folio.app")
    var existing: [URL] = []
    for candidate in [destination, legacy] where installerFiles.fileExists(atPath: candidate.path) {
        if identity(at: candidate) != applicationIdentity {
            if candidate == destination {
                throw InstallationError(message: "Another application uses this location. Choose a different Applications folder.")
            }
            continue
        }
        let installedVersion = Bundle(url: candidate)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        if installedVersion.compare(version, options: .numeric) == .orderedDescending {
            throw InstallationError(message: "A newer version is already installed.")
        }
        existing.append(candidate)
    }
    for running in NSRunningApplication.runningApplications(withBundleIdentifier: applicationIdentity) {
        if let bundle = running.bundleURL,
           existing.contains(where: { $0.resolvingSymlinksInPath() == bundle.resolvingSymlinksInPath() }) {
            throw InstallationError(message: "Save your work and quit the installed PDF editor before updating.")
        }
    }
    let transaction = UUID().uuidString
    let staging = applications.appendingPathComponent(".Pageline-\(transaction).app")
    var backups: [(original: URL, backup: URL)] = []
    do {
        try installerFiles.copyItem(at: source, to: staging)
        guard identity(at: staging) == applicationIdentity,
              Bundle(url: staging)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String == version else {
            throw InstallationError(message: "The application copy could not be verified.")
        }
        for old in existing {
            let backup = applications.appendingPathComponent(".\(old.lastPathComponent)-\(transaction).backup")
            try installerFiles.moveItem(at: old, to: backup)
            backups.append((old, backup))
        }
        try installerFiles.moveItem(at: staging, to: destination)
    } catch {
        var recoveryFailures: [String] = []
        for item in backups.reversed() {
            do { try installerFiles.moveItem(at: item.backup, to: item.original) }
            catch { recoveryFailures.append(item.backup.path) }
        }
        try? installerFiles.removeItem(at: staging)
        if !recoveryFailures.isEmpty {
            throw InstallationError(message: "Installation failed. Previous app copies are available at " + recoveryFailures.joined(separator: ", "))
        }
        throw error
    }
    var warnings: [String] = []
    for item in backups {
        do { try installerFiles.removeItem(at: item.backup) }
        catch { warnings.append("An old application backup remains at \(item.backup.path).") }
    }
    var shortcutCreated = false
    if shortcut {
        do {
            try installerFiles.createDirectory(at: desktop, withIntermediateDirectories: true)
            let link = desktop.appendingPathComponent("Pageline.app")
            let exists = (try? installerFiles.attributesOfItem(atPath: link.path)) != nil
            if exists {
                guard let target = try? installerFiles.destinationOfSymbolicLink(atPath: link.path),
                      identity(at: URL(fileURLWithPath: target, relativeTo: desktop)) == applicationIdentity else {
                    throw InstallationError(message: "A different item already uses the desktop shortcut name.")
                }
                try installerFiles.removeItem(at: link)
            }
            try installerFiles.createSymbolicLink(at: link, withDestinationURL: destination)
            shortcutCreated = true
        } catch { warnings.append("Pageline was installed, but the desktop shortcut could not be created. \(error.localizedDescription)") }
    }
    return InstallationResult(application: destination, shortcut: shortcutCreated, warning: warnings.isEmpty ? nil : warnings.joined(separator: "\n"))
}

let sourceApplication = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("Pageline.app")
let arguments = CommandLine.arguments
if let targetIndex = arguments.firstIndex(of: "--install-to"), targetIndex + 1 < arguments.count {
    let target = URL(fileURLWithPath: arguments[targetIndex + 1])
    let desktopIndex = arguments.firstIndex(of: "--desktop")
    let desktop = desktopIndex.flatMap { $0 + 1 < arguments.count ? URL(fileURLWithPath: arguments[$0 + 1]) : nil }
        ?? installerFiles.homeDirectoryForCurrentUser.appendingPathComponent("Desktop")
    do {
        let result = try installApplication(source: sourceApplication, applications: target, desktop: desktop, shortcut: arguments.contains("--shortcut"))
        let data: [String: Any] = ["application": result.application.path, "shortcut": result.shortcut, "warning": result.warning as Any? ?? NSNull()]
        print(String(data: try JSONSerialization.data(withJSONObject: data), encoding: .utf8)!)
        exit(0)
    } catch {
        fputs("\(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

final class InstallerDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let location = NSPopUpButton()
    let shortcut = NSButton(checkboxWithTitle: "Create a desktop shortcut / 建立桌面捷徑", target: nil, action: nil)
    let installButton = NSButton(title: "Install / Update · 安裝／更新", target: nil, action: nil)

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 290), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Install Pageline"
        let title = NSTextField(labelWithString: "Pageline")
        title.font = .systemFont(ofSize: 28, weight: .semibold)
        let description = NSTextField(wrappingLabelWithString: "Install the PDF editor or update an existing Folio/Pageline installation.\n安裝 PDF 編輯器，或更新現有的 Folio／Pageline。")
        description.font = .systemFont(ofSize: 13)
        location.addItems(withTitles: ["/Applications", "~/Applications"])
        if !installerFiles.isWritableFile(atPath: "/Applications") { location.selectItem(at: 1) }
        shortcut.state = .on
        installButton.target = self
        installButton.action = #selector(installSelected)
        installButton.bezelStyle = .rounded
        installButton.keyEquivalent = "\r"
        let stack = NSStackView(views: [title, description, location, shortcut, installButton])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 24)
        ])
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func installSelected() {
        installButton.isEnabled = false
        defer { installButton.isEnabled = true }
        let applications = location.indexOfSelectedItem == 0 ? URL(fileURLWithPath: "/Applications") : installerFiles.homeDirectoryForCurrentUser.appendingPathComponent("Applications")
        do {
            let result = try installApplication(source: sourceApplication, applications: applications, desktop: installerFiles.homeDirectoryForCurrentUser.appendingPathComponent("Desktop"), shortcut: shortcut.state == .on)
            let alert = NSAlert()
            alert.messageText = "Pageline installed / 安裝完成"
            alert.informativeText = result.warning ?? "Pageline is ready in \(result.application.deletingLastPathComponent().path).\n您可以開啟 Pageline。"
            alert.addButton(withTitle: "Open Pageline / 開啟")
            alert.addButton(withTitle: "Done / 完成")
            if alert.runModal() == .alertFirstButtonReturn {
                let configuration = NSWorkspace.OpenConfiguration()
                configuration.createsNewApplicationInstance = true
                NSWorkspace.shared.openApplication(at: result.application, configuration: configuration) { _, _ in }
            }
            NSApp.terminate(nil)
        } catch {
            let alert = NSAlert()
            alert.messageText = "Installation could not finish / 無法完成安裝"
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let application = NSApplication.shared
let delegate = InstallerDelegate()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
