import { useCallback, useEffect, useRef, useState } from 'react'
import { Dimensions, Keyboard, LayoutChangeEvent, Platform } from 'react-native'

/**
 * Alto del teclado en dp, 0 si está cerrado.
 *
 * Se toma el MÁXIMO de las dos estimaciones que da RN porque cada una degenera en
 * escenarios distintos (targetSdk 36 = edge-to-edge obligatorio):
 *  - `altoVentana - endCoordinates.screenY`: en Android API 30+ `screenY` sale del
 *    "visible display frame" de la actividad, que con edge-to-edge puede no achicarse
 *    nunca → esta estimación se va a 0.
 *  - `endCoordinates.height`: en Android API 30+ es `imeInsets.bottom - barInsets.bottom`,
 *    o sea el teclado MENOS la barra de navegación → se queda corta por unos 24-48dp
 *    cuando la app dibuja por debajo de la barra.
 * Quedarse alto de más solo sube el diálogo unos px; quedarse corto deja campos tapados.
 */
export function useKeyboardHeight() {
    const [height, setHeight] = useState(0)

    useEffect(() => {
        // iOS avisa antes de animar (willShow), así el contenido sube junto con el teclado.
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

        const show = Keyboard.addListener(showEvent, (e) => {
            const windowHeight = Dimensions.get('window').height
            const fromScreenY = e.endCoordinates?.screenY != null
                ? windowHeight - e.endCoordinates.screenY
                : 0
            const fromHeight = e.endCoordinates?.height ?? 0

            setHeight(Math.round(Math.max(0, fromScreenY, fromHeight)))
        })

        const hide = Keyboard.addListener(hideEvent, () => setHeight(0))

        return () => { show.remove(); hide.remove() }
    }, [])

    return height
}

/**
 * Cuánto padding hay que meterle a un contenedor full-screen (el Portal de un Dialog de
 * Tamagui, el backdrop de un Modal de RN) para que su contenido centrado no quede debajo
 * del teclado.
 *
 * Por qué no alcanza con KeyboardAvoidingView:
 *  - Los diálogos de Tamagui se montan en un Portal y los Modal de RN abren su propia
 *    ventana en Android: un KeyboardAvoidingView puesto en la pantalla no los toca.
 *  - Con edge-to-edge `adjustResize` no achica la ventana, así que behavior="height"/
 *    "padding" no reacciona (y parpadea al cerrar el teclado).
 *
 * Por qué se mide el contenedor: en algunos equipos/ventanas el sistema SÍ achica el
 * layout solo. Si compensáramos a ciegas el alto del teclado, ahí subiríamos el doble y
 * el diálogo se saldría por arriba. Comparando el alto actual contra el alto en reposo
 * sabemos cuánto subió solo y solo compensamos lo que falta.
 *
 * Uso:
 *   const { inset, onLayout } = useKeyboardInset()
 *   <Dialog.Portal paddingBottom={inset} onLayout={onLayout}>
 */
export function useKeyboardInset() {
    const keyboardHeight = useKeyboardHeight()
    const [containerHeight, setContainerHeight] = useState(0)
    // Alto del contenedor con el teclado cerrado. Sirve de referencia para saber si el
    // sistema lo achicó. Si el campo tiene autoFocus puede que nunca lo midamos sin
    // teclado; en ese caso el alto de la ventana es una referencia razonable.
    const restingHeightRef = useRef(0)

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerHeight(e.nativeEvent.layout.height)
    }, [])

    if (keyboardHeight === 0 && containerHeight > 0) {
        restingHeightRef.current = containerHeight
    }

    const restingHeight = restingHeightRef.current || Dimensions.get('window').height
    // Lo que el sistema ya subió por su cuenta.
    const shrunkBy = containerHeight > 0 ? Math.max(0, restingHeight - containerHeight) : 0

    return {
        inset: Math.max(0, keyboardHeight - shrunkBy),
        onLayout,
    }
}

export default useKeyboardInset
