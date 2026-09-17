import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = { children: React.ReactNode }
type State = { error: Error | null; stack: string | null }

/**
 * Red de seguridad del árbol completo.
 *
 * En Release no hay caja roja: si algo lanza durante el render, React desmonta
 * todo y la pantalla queda en BLANCO para siempre, sin ningún rastro. Eso fue lo
 * que reportó la revisión de Apple ("blank white screen indefinitely"), y del
 * lado nuestro no hubo forma de saber qué había pasado.
 *
 * A propósito se dibuja con primitivas de react-native y colores fijos: si lo que
 * reventó fue el tema o Tamagui, esta pantalla tiene que poder pintarse igual.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, stack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.log('[ErrorBoundary]', error?.message, info?.componentStack)
    this.setState({ stack: info?.componentStack ?? null })
  }

  reintentar = () => this.setState({ error: null, stack: null })

  render() {
    const { error, stack } = this.state
    if (!error) return this.props.children

    return (
      <View style={styles.contenedor}>
        <ScrollView contentContainerStyle={styles.contenido}>
          <Text style={styles.titulo}>La aplicación tuvo un problema</Text>

          <Text style={styles.texto}>
            Ocurrió un error al dibujar la pantalla. Intenta de nuevo; si vuelve a
            pasar, muestra este detalle a soporte.
          </Text>

          <Text style={styles.error}>{String(error?.message ?? error)}</Text>

          {stack ? <Text style={styles.stack}>{stack.trim()}</Text> : null}
        </ScrollView>

        <TouchableOpacity
          style={styles.boton}
          onPress={this.reintentar}
          activeOpacity={0.85}
        >
          <Text style={styles.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contenido: {
    paddingTop: 70,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  texto: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 18,
  },
  error: {
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '600',
    marginBottom: 14,
  },
  stack: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  boton: {
    backgroundColor: '#FF551A',
    margin: 24,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
})
