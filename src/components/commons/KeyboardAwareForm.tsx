import React, { useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView as RNScrollView,
  StyleProp,
  TextInput,
  ViewStyle,
} from 'react-native'

/**
 * Contenedor de formularios que resuelve "el teclado me tapa el campo".
 *
 * ── EL PROBLEMA ────────────────────────────────────────────────────────────
 * En Android con New Architecture + edge-to-edge (esta app, SDK 36),
 * `windowSoftInputMode="adjustResize"` NO achica la ventana: el teclado se
 * dibuja ENCIMA. Por eso `KeyboardAvoidingView` solo no alcanza — el fondo del
 * contenido siempre queda detrás del teclado. En iOS sí funciona con
 * behavior="padding".
 *
 * ── LA SOLUCIÓN (3 piezas, todas necesarias) ───────────────────────────────
 * 1. ScrollView NATIVO de RN, no el de tamagui: el ref de tamagui no expone el
 *    scroll de forma confiable.
 * 2. paddingBottom dinámico = alto del teclado (solo Android): da rango de
 *    scroll para poder subir el contenido por encima del teclado.
 * 3. Al abrirse el teclado, se mide el campo enfocado y se desplaza SOLO el
 *    solape. Un `scrollToEnd` se va hasta el final del padding y deja un hueco
 *    enorme; esto sube lo justo.
 *
 * ── POR QUÉ ES DROP-IN ─────────────────────────────────────────────────────
 * El campo enfocado se obtiene con `TextInput.State.currentlyFocusedInput()`,
 * así que NO hay que tocar los inputs: basta envolver el formulario. Para
 * precisión extra (cambiar de campo con el teclado YA abierto, donde
 * keyboardDidShow no vuelve a disparar) se puede pasar `onFocus={subirCampo}`
 * usando el helper `useSubirCampo()`.
 *
 * Se llegó a este patrón después de perder bastante tiempo probando variantes
 * de KeyboardAvoidingView; está validado en el form de Usuarios.
 */

type Props = {
  children: React.ReactNode
  /** Espacio extra al fondo, además del alto del teclado. */
  extraBottom?: number
  /** Estilo del contenido (padding del form, etc.). */
  contentContainerStyle?: StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
  showsVerticalScrollIndicator?: boolean
}

/** Margen entre el campo y el borde del teclado, para que no quede pegado. */
const HOLGURA = 24

export default function KeyboardAwareForm({
  children,
  extraBottom = 24,
  contentContainerStyle,
  style,
  showsVerticalScrollIndicator = false,
}: Props) {
  const [kbHeight, setKbHeight] = useState(0)
  const scrollRef = useRef<RNScrollView>(null)
  const scrollY = useRef(0)

  // Sube el campo enfocado lo justo para que quede sobre el teclado.
  const subirCampoEnfocado = (bordeTeclado: number) => {
    // El padding dinámico se aplica en el mismo render que el kbHeight; el
    // delay le da tiempo para que el scroll tenga a dónde ir.
    setTimeout(() => {
      let node: any = null
      try {
        node = (TextInput as any)?.State?.currentlyFocusedInput?.()
      } catch {
        node = null
      }
      if (!node?.measureInWindow) return

      node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const solape = y + h + HOLGURA - bordeTeclado
        if (solape > 0) {
          scrollRef.current?.scrollTo({ y: scrollY.current + solape, animated: true })
        }
      })
    }, 140)
  }

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const alto = e.endCoordinates?.height ?? 0
      setKbHeight(alto)
      // screenY = borde superior del teclado. Si no viene, se deriva del alto.
      const borde = e.endCoordinates?.screenY ?? Dimensions.get('window').height - alto
      subirCampoEnfocado(borde)
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      // iOS: 'padding' funciona bien. Android: undefined — ahí lo resuelve el
      // paddingBottom dinámico, porque el KAV no maneja el teclado bajo
      // edge-to-edge / New Arch.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <RNScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        // Que un tap en un botón funcione con el teclado abierto, sin necesitar
        // dos toques (el primero para cerrar el teclado).
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          contentContainerStyle,
          {
            flexGrow: 1,
            paddingBottom: (Platform.OS === 'android' ? kbHeight : 0) + extraBottom,
          },
        ]}
      >
        {children}
      </RNScrollView>
    </KeyboardAvoidingView>
  )
}
