import UIKit
import React_RCTAppDelegate

/**
 * Ciclo de vida por escenas (UIScene).
 *
 * Desde el SDK 27 UIKit se niega a lanzar una app que no lo adopte. Y el arreglo
 * a medias es peor que nada: poner solo `UIApplicationSceneManifest` en el
 * Info.plist convierte el fallo de arranque en una PANTALLA EN BLANCO, porque la
 * ventana que creaba el AppDelegate nunca queda conectada a la escena.
 *
 * Por eso la ventana se crea acá, a partir del `UIWindowScene`, y React arranca
 * sobre ella. El AppDelegate solo deja lista la factory.
 *
 * Los callbacks de notificaciones push NO se mueven: siguen siendo métodos de
 * UIApplicationDelegate y RNFirebase los intercepta ahí.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Espejo para el código que sigue buscando la ventana en el AppDelegate
    // (RNFirebase, LogBox). Es la misma ventana, no otra.
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "IMCore",
      in: window,
      launchOptions: appDelegate.launchOptions
    )
  }
}
