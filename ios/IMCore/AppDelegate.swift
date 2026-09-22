import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  // NO la borres aunque la ventana ya no nazca acá: RNFirebase Messaging lee
  // `delegate.window` en el UIApplicationDidFinishLaunchingNotification y, sin la
  // propiedad, la app revienta al arrancar con "unrecognized selector ... window".
  // El SceneDelegate la apunta a la ventana real de la escena. También la lee el
  // LogBox de RN en desarrollo.
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  // Las guarda para el SceneDelegate: quien arranca React es él, no este archivo.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Inicializa Firebase (notificaciones push) si hay GoogleService-Info.plist
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }

    self.launchOptions = launchOptions

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // Acá NO se crea la ventana ni se llama a startReactNative: eso vive en
    // SceneDelegate.scene(_:willConnectTo:options:), porque la ventana tiene que
    // nacer del UIWindowScene. Ver el comentario de SceneDelegate.swift.
    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
