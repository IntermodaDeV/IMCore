import React, { useCallback, useEffect, useRef, useState } from 'react'
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
 * así que NO hay que tocar los inputs: basta envolver el formulario.
 *
 * ── EL CASO QUE NO CUBRE SOLO: SALTAR DE CAMPO ─────────────────────────────
 * Con el teclado YA abierto, tocar otro campo NO vuelve a disparar
 * keyboardDidShow, así que el form no se mueve y el campo nuevo puede quedar
 * debajo del teclado. Para eso está `useSubirCampo()`: devuelve una función
 * para pasarle a `onFocus` de cada input. Es OPCIONAL y no rompe nada — fuera
 * de un KeyboardAwareForm no hace nada.
 *
 *     const subirCampo = useSubirCampo()
 *     <Input onFocus={subirCampo} … />
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

// Formularios montados, en orden de montaje. El último es el que está a la
// vista (en un stack, la pantalla de encima se monta después).
//
// NO se usa un Context a propósito: la pantalla llama a useSubirCampo() en su
// cuerpo, pero renderiza el <KeyboardAwareForm> DENTRO de su propio JSX, así que
// queda POR ENCIMA del proveedor y recibiría siempre el valor por defecto. Con
// un registro a nivel de módulo el hook funciona se llame donde se llame, que es
// lo que promete ser "drop-in".
const formulariosMontados: Array<() => void> = []

/**
 * Función para el `onFocus` de un input: sube el campo por encima del teclado
 * cuando el teclado YA está abierto (saltar de un campo a otro). Cuando el
 * teclado se abre por primera vez lo resuelve el propio formulario.
 *
 * Sin ningún KeyboardAwareForm montado no hace nada.
 */
export const useSubirCampo = () =>
  useCallback(() => {
    formulariosMontados[formulariosMontados.length - 1]?.()
  }, [])

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
  // Último borde superior conocido del teclado. Se guarda para poder subir un
  // campo que se enfoca con el teclado ya abierto, cuando no hay evento nuevo.
  const bordeTeclado = useRef(0)

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
      bordeTeclado.current = borde
      subirCampoEnfocado(borde)
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0)
      bordeTeclado.current = 0
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  // Con el teclado cerrado no hay nada que hacer: al abrirse, keyboardDidShow
  // se encarga. Con el teclado abierto es el único camino, porque ese evento ya
  // no vuelve a dispararse.
  const subirCampo = useRef(() => {
    if (bordeTeclado.current > 0) subirCampoEnfocado(bordeTeclado.current)
  })

  useEffect(() => {
    const fn = subirCampo.current
    formulariosMontados.push(fn)
    return () => {
      const i = formulariosMontados.indexOf(fn)
      if (i >= 0) formulariosMontados.splice(i, 1)
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
