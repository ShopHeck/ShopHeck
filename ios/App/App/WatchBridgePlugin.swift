import Capacitor
import WatchConnectivity

/// The phone's half of the watch link.
///
/// Pushes the round timer's configuration to the wrist and forwards heart-rate
/// samples and control commands back to the web layer as plugin events.
///
/// CAPInstancePlugin, registered by instance from MainViewController's
/// capacitorDidLoad — the same reason HealthKitPlugin is: Capacitor only
/// auto-registers plugins from npm packages, so an app-target plugin
/// conforming to CAPBridgedPlugin is not discovered on its own.
@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "WatchBridgePlugin"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise),
    ]

    private var session: WCSession? {
        WCSession.isSupported() ? WCSession.default : nil
    }

    /// Session the phone last pushed (or accepted from the wrist). Used to drop
    /// late transferUserInfo commands from a finished fight.
    private var activeSessionId: String?
    private var lastAcceptedSeq: Int = 0

    override public func load() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        guard let session else {
            call.resolve(["supported": false, "paired": false, "appInstalled": false])
            return
        }
        call.resolve([
            "supported": true,
            "paired": session.isPaired,
            // Distinguished from `paired` on purpose: a fighter with an Apple
            // Watch who has not installed the watch app needs a different
            // prompt from one with no watch at all.
            "appInstalled": session.isWatchAppInstalled,
        ])
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard let session, session.activationState == .activated else {
            call.reject("Watch session is not available")
            return
        }
        // Built through WatchSessionConfig rather than as a literal dictionary.
        // The keys used to be spelled out here, which meant the shared
        // WatchMessages.swift was not actually shared with this side — renaming
        // a key on the watch would have compiled cleanly and failed silently on
        // a device, mid-round, which is the exact bug that file exists to make
        // impossible. It also gets the clamping for free: these values arrive
        // from a JSON bridge and drive a countdown.
        let sessionId = call.getString(WatchMessage.Key.sessionId) ?? UUID().uuidString
        let config = WatchSessionConfig(
            rounds: call.getInt(WatchMessage.Key.rounds) ?? WatchSessionConfig.fallback.rounds,
            workSec: call.getInt(WatchMessage.Key.workSec) ?? WatchSessionConfig.fallback.workSec,
            restSec: call.getInt(WatchMessage.Key.restSec) ?? WatchSessionConfig.fallback.restSec,
            prepSec: call.getInt(WatchMessage.Key.prepSec) ?? 0,
            label: call.getString(WatchMessage.Key.label) ?? WatchSessionConfig.fallback.label,
            sessionId: sessionId
        )
        activeSessionId = sessionId
        lastAcceptedSeq = 0

        // Application context, not sendMessage: it is a single latest-value
        // slot that the system delivers whenever the watch app next runs, even
        // if it is not launched right now. sendMessage would fail outright
        // when the watch app is not in the foreground, which is the normal
        // case at the moment a fighter starts a round on the phone.
        do {
            try session.updateApplicationContext(config.payload)
            call.resolve()
        } catch {
            call.reject("Could not reach the watch: \(error.localizedDescription)")
        }
    }

    @objc func endSession(_ call: CAPPluginCall) {
        activeSessionId = nil
        lastAcceptedSeq = 0
        guard let session, session.activationState == .activated else {
            call.resolve()
            return
        }
        try? session.updateApplicationContext([WatchMessage.kindKey: WatchMessage.endSession])
        call.resolve()
    }

    private func forward(_ payload: [String: Any]) {
        guard let kind = payload[WatchMessage.kindKey] as? String else { return }
        switch kind {
        case WatchMessage.heartRate:
            guard let bpm = payload[WatchMessage.Key.bpm] as? Int else { return }
            // The JS event names are the plugin's own contract with the web
            // layer (src/plugins/WatchBridge.ts) and stay literals — they are
            // not part of the phone↔watch wire format.
            notifyListeners("heartRate", data: [
                "bpm": bpm,
                "timestamp": payload[WatchMessage.Key.timestamp] as? Double ?? Date().timeIntervalSince1970,
            ])
        case WatchMessage.command:
            guard let command = payload[WatchMessage.Key.command] as? String else { return }
            // Freshness filter — mirrors src/utils/watchCommand.ts so a late
            // queued start/pause/reset cannot hit the wrong session. Payloads
            // without identity are dropped (cannot prove they are current).
            let sessionId = payload[WatchMessage.Key.sessionId] as? String ?? ""
            let seq: Int = {
                if let i = payload[WatchMessage.Key.seq] as? Int { return i }
                if let n = payload[WatchMessage.Key.seq] as? NSNumber { return n.intValue }
                return 0
            }()
            let createdAt: TimeInterval = {
                if let d = payload[WatchMessage.Key.createdAt] as? Double { return d }
                if let n = payload[WatchMessage.Key.createdAt] as? NSNumber { return n.doubleValue }
                return 0
            }()
            let now = Date().timeIntervalSince1970
            guard !sessionId.isEmpty, seq >= 1, createdAt > 0 else { return }
            guard abs(now - createdAt) <= WatchMessage.commandTTL else { return }
            if let active = activeSessionId, active != sessionId { return }
            if seq <= lastAcceptedSeq { return }
            activeSessionId = sessionId
            lastAcceptedSeq = seq
            notifyListeners("watchCommand", data: [
                "command": command,
                "sessionId": sessionId,
                "seq": seq,
                "createdAt": createdAt,
            ])
        default:
            break
        }
    }
}

extension WatchBridgePlugin: WCSessionDelegate {
    public func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    /// Re-activate for the newly paired watch. Without this the link is dead
    /// after a watch swap until the app is relaunched.
    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.forward(message) }
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        DispatchQueue.main.async { self.forward(userInfo) }
    }
}
