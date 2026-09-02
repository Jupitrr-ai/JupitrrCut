import AVFoundation
import AVKit
import ExpoModulesCore
import UIKit

public class TeleprompterPipModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TeleprompterPip")

    Events("onPipStart", "onPipStop", "onPipError", "onPipDebug")

    OnCreate {
      MainActor.assumeIsolated {
        TeleprompterPipManager.shared.eventEmitter = { [weak self] name, payload in
          self?.sendEvent(name, payload)
        }
      }
    }

    AsyncFunction("startTeleprompterPip") { (config: [String: Any]) -> Void in
      try await TeleprompterPipManager.shared.start(config: config)
    }

    AsyncFunction("stopTeleprompterPip") { () -> Void in
      await MainActor.run {
        TeleprompterPipManager.shared.stop()
      }
    }
  }
}

private struct TeleprompterPipConfig {
  let text: String
  let fontSize: CGFloat
  let fontFamily: String
  let scrollSpeed: CGFloat
  let preparationDelaySeconds: Int
  /// Content aspect ratio (vertical / square / horizontal).
  let width: CGFloat
  let height: CGFloat
  let autoBackgroundAfterStart: Bool
}

@MainActor
private final class TeleprompterPipManager {
  static let shared = TeleprompterPipManager()

  /// Bridges native PiP lifecycle back to JS. Set from the module's OnCreate.
  var eventEmitter: ((String, [String: Any]) -> Void)?

  private var controller: TeleprompterPipController?

  func start(config: [String: Any]) async throws {
    guard #available(iOS 15.0, *), AVPictureInPictureController.isPictureInPictureSupported() else {
      throw NSError(
        domain: "TeleprompterPip",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Picture in Picture is not supported on this device"]
      )
    }

    guard let text = config["text"] as? String,
          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw NSError(
        domain: "TeleprompterPip",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Missing teleprompter text"]
      )
    }

    let parsedConfig = TeleprompterPipConfig(
      text: text,
      fontSize: CGFloat((config["fontSize"] as? NSNumber)?.doubleValue ?? 24),
      fontFamily: config["fontFamily"] as? String ?? "VarelaRound_400Regular",
      scrollSpeed: CGFloat((config["scrollSpeed"] as? NSNumber)?.doubleValue ?? 40),
      preparationDelaySeconds: max(0, (config["preparationDelaySeconds"] as? NSNumber)?.intValue ?? 3),
      width: CGFloat((config["width"] as? NSNumber)?.doubleValue ?? 1920),
      height: CGFloat((config["height"] as? NSNumber)?.doubleValue ?? 1080),
      autoBackgroundAfterStart: (config["autoBackgroundAfterStart"] as? NSNumber)?.boolValue ?? false
    )

    stop()

    guard let hostWindow = Self.keyWindow() else {
      throw NSError(
        domain: "TeleprompterPip",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Unable to find a window to host Picture in Picture"]
      )
    }

    let controller = TeleprompterPipController(
      config: parsedConfig,
      hostWindow: hostWindow,
      onStart: { [weak self] in self?.emit("onPipStart", [:]) },
      onStop: { [weak self] in
        self?.emit("onPipStop", [:])
        self?.controller = nil
      },
      onError: { [weak self] message in
        self?.emit("onPipError", ["message": message])
        self?.controller = nil
      },
      onDebug: { [weak self] message in self?.emit("onPipDebug", ["message": message]) }
    )
    self.controller = controller
    controller.start()
  }

  func stop() {
    guard let controller else { return }
    self.controller = nil
    controller.stop()
  }

  private func emit(_ name: String, _ payload: [String: Any]) {
    eventEmitter?(name, payload)
  }

  private static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    return windows.first { $0.isKeyWindow } ?? windows.first
  }
}

@MainActor
private final class TeleprompterScrollingView: UIView {
  private let config: TeleprompterPipConfig
  private let scrollContainer = UIView()
  private let textLabel = UILabel()
  private let prepLabel = UILabel()
  private var displayLink: CADisplayLink?
  private var startDate: Date?

  private var preparedDuration: TimeInterval { TimeInterval(config.preparationDelaySeconds) }

  init(config: TeleprompterPipConfig) {
    self.config = config
    super.init(frame: .zero)
    setup()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setup() {
    backgroundColor = .black
    clipsToBounds = true

    textLabel.numberOfLines = 0
    textLabel.textAlignment = .center
    textLabel.textColor = .white
    textLabel.text = config.text
    scrollContainer.addSubview(textLabel)
    addSubview(scrollContainer)

    prepLabel.textAlignment = .center
    prepLabel.textColor = UIColor.white.withAlphaComponent(0.9)
    prepLabel.isHidden = true
    addSubview(prepLabel)
  }

  func begin() {
    startDate = Date()
    layoutText()
    let link = CADisplayLink(target: self, selector: #selector(tick))
    link.preferredFramesPerSecond = 60
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  func end() {
    displayLink?.invalidate()
    displayLink = nil
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layoutText()
  }

  private func layoutText() {
    let width = bounds.width
    let height = bounds.height
    guard width > 0, height > 0 else { return }

    let textFontSize = min(max(12, config.fontSize), max(14, height * 0.32))
    textLabel.font = Self.teleprompterFont(named: config.fontFamily, size: textFontSize)
    prepLabel.font = .systemFont(ofSize: min(22, max(14, height * 0.24)), weight: .bold)

    let textWidth = width * 0.86
    let size = textLabel.sizeThatFits(CGSize(width: textWidth, height: .greatestFiniteMagnitude))
    textLabel.frame = CGRect(x: (width - textWidth) / 2, y: 0, width: textWidth, height: size.height)
    scrollContainer.frame = CGRect(x: 0, y: 0, width: width, height: size.height)
    prepLabel.frame = CGRect(x: 0, y: height * 0.12, width: width, height: max(24, height * 0.22))
  }

  private static func teleprompterFont(named fontFamily: String, size: CGFloat) -> UIFont {
    let postScriptName: String
    switch fontFamily {
    case "Nunito_400Regular":
      postScriptName = "Nunito-Regular"
    case "OpenSans_400Regular":
      postScriptName = "OpenSans-Regular"
    case "Lato_400Regular":
      postScriptName = "Lato-Regular"
    case "Raleway_400Regular":
      postScriptName = "Raleway-Regular"
    case "VarelaRound_400Regular":
      postScriptName = "VarelaRound-Regular"
    default:
      postScriptName = fontFamily
    }

    return UIFont(name: postScriptName, size: size) ?? .systemFont(ofSize: size, weight: .regular)
  }

  @objc private func tick() {
    guard let startDate else { return }
    let elapsed = max(0, Date().timeIntervalSince(startDate))
    let isPreparing = elapsed < preparedDuration

    if isPreparing {
      let countdown = max(0, Int(ceil(preparedDuration - elapsed)))
      prepLabel.isHidden = false
      prepLabel.text = countdown > 0 ? "\(countdown)" : ""
    } else {
      prepLabel.isHidden = true
    }

    let scrollingElapsed = max(0, elapsed - preparedDuration)
    let startY = max(0, (bounds.height - scrollContainer.bounds.height) / 2)
    let offset = config.scrollSpeed * CGFloat(scrollingElapsed)
    scrollContainer.frame.origin.y = startY - offset
  }
}

/// The content shown inside the PiP window. A plain UIKit view controller with
/// scrolling teleprompter content, so video-call PiP has no playback controls.
@available(iOS 15.0, *)
@MainActor
private final class TeleprompterContentViewController: AVPictureInPictureVideoCallViewController {
  private let scrollingView: TeleprompterScrollingView

  init(config: TeleprompterPipConfig) {
    scrollingView = TeleprompterScrollingView(config: config)
    super.init(nibName: nil, bundle: nil)
    preferredContentSize = CGSize(width: config.width, height: config.height)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    view.clipsToBounds = true
    scrollingView.frame = view.bounds
    scrollingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(scrollingView)
  }

  func begin() {
    scrollingView.begin()
  }

  func end() {
    scrollingView.end()
  }
}

/// Owns the video-call PiP controller and the source view.
@available(iOS 15.0, *)
@MainActor
private final class TeleprompterPipController: NSObject, @preconcurrency AVPictureInPictureControllerDelegate {

  private let config: TeleprompterPipConfig
  private weak var hostWindow: UIWindow?
  private let onStart: () -> Void
  private let onStop: () -> Void
  private let onError: (String) -> Void
  private let onDebug: (String) -> Void

  private let sourceView = UIView()
  private var contentViewController: TeleprompterContentViewController?
  private var pipController: AVPictureInPictureController?
  private var didFinish = false

  init(
    config: TeleprompterPipConfig,
    hostWindow: UIWindow,
    onStart: @escaping () -> Void,
    onStop: @escaping () -> Void,
    onError: @escaping (String) -> Void,
    onDebug: @escaping (String) -> Void
  ) {
    self.config = config
    self.hostWindow = hostWindow
    self.onStart = onStart
    self.onStop = onStop
    self.onError = onError
    self.onDebug = onDebug
    super.init()
  }

  private func appStateString() -> String {
    switch UIApplication.shared.applicationState {
    case .active: return "active"
    case .inactive: return "inactive"
    case .background: return "background"
    @unknown default: return "unknown"
    }
  }

  func start() {
    let audioSession = AVAudioSession.sharedInstance()
    try? audioSession.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
    try? audioSession.setActive(true)

    sourceView.frame = CGRect(x: 1, y: 1, width: 1, height: 1)
    sourceView.backgroundColor = .clear
    sourceView.alpha = 0.01
    sourceView.isUserInteractionEnabled = false
    sourceView.subviews.forEach { $0.removeFromSuperview() }
    hostWindow?.addSubview(sourceView)

    let content = TeleprompterContentViewController(config: config)
    contentViewController = content

    let contentSource = AVPictureInPictureController.ContentSource(
      activeVideoCallSourceView: sourceView,
      contentViewController: content
    )
    let controller = AVPictureInPictureController(contentSource: contentSource)
    controller.delegate = self
    controller.canStartPictureInPictureAutomaticallyFromInline = true
    pipController = controller

    content.begin()
    onDebug(
      "start() called, appState=\(appStateString()), autoBackground=\(config.autoBackgroundAfterStart)"
    )
    startWhenPossible(attemptsRemaining: 20)
    scheduleAutoBackgroundIfNeeded()
  }

  private func scheduleAutoBackgroundIfNeeded() {
    guard config.autoBackgroundAfterStart else { return }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
      MainActor.assumeIsolated {
        guard let self, !self.didFinish else { return }
        self.onDebug("auto-background firing (appState=\(self.appStateString()))")
        let selector = NSSelectorFromString("suspend")
        let sent = UIApplication.shared.sendAction(
          selector,
          to: UIApplication.shared,
          from: nil,
          for: nil
        )
        self.onDebug("auto-background sent=\(sent) (appState=\(self.appStateString()))")
      }
    }
  }

  private func startWhenPossible(attemptsRemaining: Int) {
    guard !didFinish, let controller = pipController else { return }

    if controller.isPictureInPicturePossible {
      onDebug("possible=true, starting (appState=\(appStateString()))")
      controller.startPictureInPicture()
      return
    }

    guard attemptsRemaining > 0 else {
      onDebug("gave up: never became possible (appState=\(appStateString()))")
      finish(error: "Picture in Picture did not become available")
      return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      MainActor.assumeIsolated {
        self?.startWhenPossible(attemptsRemaining: attemptsRemaining - 1)
      }
    }
  }

  func stop() {
    guard !didFinish else { return }
    pipController?.stopPictureInPicture()
    teardown()
    onStop()
    didFinish = true
  }

  private func finish(error message: String) {
    guard !didFinish else { return }
    teardown()
    onError(message)
    didFinish = true
  }

  private func teardown() {
    contentViewController?.end()
    contentViewController = nil
    sourceView.removeFromSuperview()
    pipController = nil
    try? AVAudioSession.sharedInstance()
      .setActive(false, options: [.notifyOthersOnDeactivation])
  }

  // MARK: - AVPictureInPictureControllerDelegate

  func pictureInPictureControllerWillStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    onDebug("willStart (appState=\(appStateString()))")
  }

  func pictureInPictureControllerDidStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    onDebug("didStart (appState=\(appStateString()))")
    onStart()
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error
  ) {
    onDebug("failedToStart: \(error.localizedDescription) (appState=\(appStateString()))")
    finish(error: error.localizedDescription)
  }

  func pictureInPictureControllerDidStopPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    guard !didFinish else { return }
    teardown()
    onStop()
    didFinish = true
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
  ) {
    completionHandler(true)
  }
}
