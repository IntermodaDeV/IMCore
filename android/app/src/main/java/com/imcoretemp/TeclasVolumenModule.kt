package com.IMCore

import android.view.KeyEvent
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Teclas de volumen como «una pieza más / una menos» de la última barra escaneada
 * (Inventario Clientes › Escanear). Solo mientras JS lo ARMA: con la pantalla de escaneo
 * al frente y una barra lista. Desarmado, el volumen funciona normal.
 * MainActivity le pasa cada tecla; armado, consume las de volumen (no cambia el volumen
 * ni sale el control del sistema) y avisa a JS con el evento «teclaVolumen».
 */
class TeclasVolumenModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "TeclasVolumen"

  override fun initialize() {
    super.initialize()
    instancia = this
  }

  override fun invalidate() {
    if (instancia === this) instancia = null
    armado = false
    super.invalidate()
  }

  @ReactMethod
  fun armar(activo: Boolean) {
    armado = activo
  }

  // Los pide NativeEventEmitter en JS.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  companion object {
    @Volatile private var armado = false
    @Volatile private var instancia: TeclasVolumenModule? = null

    /** true = la tecla fue de volumen y se usó aquí (no llega al sistema). */
    fun tecla(event: KeyEvent): Boolean {
      val sube = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP
      if (!sube && event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return false
      val m = instancia
      if (!armado || m == null) return false
      if (event.action == KeyEvent.ACTION_DOWN) {
        val p = Arguments.createMap()
        p.putString("tecla", if (sube) "subir" else "bajar")
        p.putInt("repeticion", event.repeatCount)
        m.ctx.emitDeviceEvent("teclaVolumen", p)
      }
      // También el ACTION_UP: si se deja pasar, el sistema muestra el volumen al soltar.
      return true
    }
  }
}

class TeclasVolumenPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(TeclasVolumenModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
