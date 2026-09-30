import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, FlatList, Modal, PermissionsAndroid, Platform, StyleSheet, TextInput, Vibration, useWindowDimensions,
} from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ArrowLeft, Camera as CameraIcon, CloudDownload, Flag, Keyboard as KeyboardIcon, Minus, Plus, QrCode, ScanLine, X } from 'lucide-react-native'
import { Camera } from 'react-native-camera-kit'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { inventarioImpulsadorasService as api, mensajeDeError } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.service'
import {
  AsignacionLocal, ConflictoQrBarra, DanadoRepetido, LecturaLocal, ModoEscaneo, ResumenCodigo, ajustarCantidad, asignacion,
  cambiarBarraPorQR, doblesConteos, importarDelServidor, limpiarCodigo, modoInicial, pedirFinalizar, registrarLectura,
  resumenCodigos, totales, ultimasLecturas,
} from '../../services/inventarioImpulsadoras/baseLocal'
import { motorEnvio } from '../../services/inventarioImpulsadoras/motorEnvio'
import { ACCENT, BarraEnvio, ERR, OK, WARN, fmtN, textoCodigo, useEstadoMotor } from './components'

// Escanear un inventario. Reglas que salen de lo que fallaba en la app vieja:
//  - Cada lectura se guarda en el equipo ANTES de vibrar: si vibró, está guardada.
//  - Un error NUNCA abre una ventana que tape el escáner (la vieja descartaba lo que se
//    escaneaba mientras el aviso estaba abierto): vibra distinto y queda en la franja.
//  - El lector de la PDA escribe como teclado: el campo tiene el teclado en pantalla
//    APAGADO y conserva el foco; el botón del teclado lo activa para escribir a mano.

const MENSAJE_ESTADO: Record<string, string> = {
  CERRADO: 'Este inventario ya se cerró desde la oficina. Lo que tengas guardado se envía igual.',
  DESACTIVADO: 'Este inventario se desactivó. Lo que tengas guardado se envía igual.',
  QUITADA: 'Te quitaron de este inventario. Lo que tengas guardado se envía igual y la oficina lo ve.',
  FINALIZADA: 'Ya finalizaste tu parte. Si hace falta seguir, pide que la reabran.',
}

type Aviso = { ok: boolean; texto: string; deshacer?: boolean; conflicto?: ConflictoQrBarra; danadoRepetido?: DanadoRepetido } | null

const MODOS: Record<'QR' | 'BARRA' | 'NOENCONTRADO', string> = { QR: 'QR', BARRA: 'Barra', NOENCONTRADO: 'QR dañado' }

// Cuánto se ofrece «Deshacer» después de quitar una línea.
const DESHACER_MS = 10000

export default function EscanearScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const iu: number = route.params?.iu
  const { user } = useAuth()
  const userCode = user?.Code ?? ''
  const estadoMotor = useEstadoMotor()
  // Pantalla chica (la PDA Unitech EA520 es 360×640 dp): todo más apretado para que se vea la lista.
  const { height: altoPantalla, width: anchoPantalla } = useWindowDimensions()
  const compacto = altoPantalla < 720 || anchoPantalla < 370

  const [a, setA] = useState<AsignacionLocal | undefined>(() => asignacion(iu))
  const [tot, setTot] = useState(() => totales(iu))
  const [ultimas, setUltimas] = useState<LecturaLocal[]>(() => ultimasLecturas(iu))
  const [vista, setVista] = useState<'lecturas' | 'resumen'>('lecturas')
  const [resumen, setResumen] = useState<ResumenCodigo[]>([])
  // Qué se escanea: en Mixto arranca en QR y para una pieza de solo barra se cambia a propósito.
  const [modo, setModo] = useState<ModoEscaneo>(() => modoInicial(asignacion(iu)?.tipo_escaneo ?? ''))
  const [teclado, setTeclado] = useState(false)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [camara, setCamara] = useState(false)
  const [ajuste, setAjuste] = useState<ResumenCodigo | null>(null)
  const [recuperando, setRecuperando] = useState(false)
  // Lo último que se quitó, para «Deshacer» (vuelve a la cantidad de antes, como otro ajuste).
  const quitado = useRef<{ tipo: ResumenCodigo['tipo']; codigo: string; cantidad: number } | null>(null)
  const timerDeshacer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inputRef = useRef<TextInput>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // El texto del campo AL INSTANTE. El lector escribe letra por letra y al final manda ENTER:
  // si en ese momento se leyera el estado (`texto`), puede no tener aún las últimas letras
  // (la pantalla no alcanzó a actualizarse) y se procesaría un código vacío o cortado.
  const textoRef = useRef('')
  const ultimoEvento = useRef(0)
  const contador = useRef(0)

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">{a?.correlativo ?? 'Inventario'}</Text>,
  }, [a?.correlativo])

  const [dobles, setDobles] = useState<Set<string>>(() => new Set())
  const verResumen = useCallback(() => {
    setResumen(resumenCodigos(iu))
    setDobles(new Set(doblesConteos(iu).map(d => d.barra)))
  }, [iu])

  const recargar = useCallback(() => {
    setA(asignacion(iu))
    setTot(totales(iu))
    setUltimas(ultimasLecturas(iu))
    if (vista === 'resumen') verResumen()
  }, [iu, vista, verResumen])

  useFocusEffect(useCallback(() => {
    if (userCode) motorEnvio.iniciar(userCode)
    recargar()
    const t = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [recargar, userCode]))

  // Después de un envío cambian los pendientes y, a veces, el estado (lo cerraron).
  useEffect(() => { recargar() }, [estadoMotor.ultimoEnvioOk]) // eslint-disable-line react-hooks/exhaustive-deps

  const puedeEscanear = !!a && a.puede_escanear === 1 && a.finalizar_pedido !== 1
  const aceptaQR = !!a?.tipo_escaneo.includes('QR')

  const trasAjuste = () => {
    motorEnvio.avisarLectura()
    verResumen()
    setTot(totales(iu))
    setUltimas(ultimasLecturas(iu))
  }

  // Abrir la línea de un código: tocándolo en «Por código» o manteniendo presionada una lectura.
  const abrirLinea = (tipo: ResumenCodigo['tipo'], codigo: string) => {
    if (!puedeEscanear) return
    const r = resumenCodigos(iu).find(x => x.tipo === tipo && x.codigo === codigo)
    if (r && r.cantidad > 0) setAjuste(r)
  }

  const quitarLinea = async (r: ResumenCodigo) => {
    const l = await ajustarCantidad(iu, userCode, r.tipo, r.codigo, 0)
    setAjuste(null)
    if (!l) return
    trasAjuste()
    quitado.current = { tipo: r.tipo, codigo: r.codigo, cantidad: r.cantidad }
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    timerDeshacer.current = setTimeout(() => {
      quitado.current = null
      setAviso(v => (v?.deshacer ? { ...v, deshacer: false } : v))
    }, DESHACER_MS)
    Vibration.vibrate(35)
    setAviso({ ok: true, deshacer: true,
      texto: `Quitaste ${r.cantidad === 1 ? '1 pieza' : `${fmtN(r.cantidad)} piezas`} · ${textoCodigo(r.tipo, r.codigo)}` })
    setTimeout(() => inputRef.current?.focus(), 300)
  }

  const deshacer = async () => {
    const q = quitado.current
    if (!q) return
    quitado.current = null
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    await ajustarCantidad(iu, userCode, q.tipo, q.codigo, q.cantidad)
    trasAjuste()
    setAviso({ ok: true, texto: `Se devolvió · ${textoCodigo(q.tipo, q.codigo)}` })
    inputRef.current?.focus()
  }

  const procesar = useCallback(async (crudo: string, forzarModo?: ModoEscaneo, otraPiezaDanada = false) => {
    if (!a || !puedeEscanear) return
    const codigo = limpiarCodigo(crudo)
    if (!codigo) return
    const r = await registrarLectura(iu, userCode, codigo, forzarModo ?? modo, a.tipo_escaneo, { otraPiezaDanada })
    console.log(`[InvScan] resultado ${r.ok ? `OK ${r.lectura.tipo}` : `NO: ${r.motivo}`} len=${codigo.length}`)
    if (r.ok) {
      Vibration.vibrate(35)
      // «QR dañado» vale para UNA pieza: sin serie no se distingue la misma pieza escaneada dos veces,
      // así que la siguiente dañada exige volver a elegir el modo.
      const eraDanado = r.lectura.tipo === 'NOENCONTRADO'
      if (eraDanado) setModo(modoInicial(a.tipo_escaneo))
      setAviso({ ok: true, texto: eraDanado
        ? `QR dañado · ${textoCodigo(r.lectura.tipo, r.lectura.codigo)} · vuelve a modo QR`
        : `${r.lectura.tipo} · ${textoCodigo(r.lectura.tipo, r.lectura.codigo)}` })
      setUltimas(u => [r.lectura, ...u].slice(0, 30))
      setTot(t => ({ ...t, lecturas: t.lecturas + 1, piezas: t.piezas + 1, pendientes: t.pendientes + 1 }))
      motorEnvio.avisarLectura()
      // Los códigos distintos se recuentan de vez en cuando, no en cada lectura.
      if (++contador.current % 20 === 0) setTot(totales(iu))
    } else {
      Vibration.vibrate([0, 160, 90, 160])
      setAviso(r.conflicto
        ? { ok: false, texto: r.motivo, conflicto: r.conflicto }
        : r.danadoRepetido ? { ok: false, texto: r.motivo, danadoRepetido: r.danadoRepetido }
        : { ok: false, texto: `${r.motivo}${r.codigo ? ` · ${textoCodigo(r.codigo.includes(',') ? 'QR' : 'BARRA', r.codigo)}` : ''}` })
    }
  }, [a, puedeEscanear, iu, userCode, modo])

  // «Es la misma pieza»: se quita una barra suelta y se cuenta el QR (queda como ajuste + lectura).
  const cambiarPorQR = async (c: ConflictoQrBarra) => {
    const r = await cambiarBarraPorQR(iu, userCode, c)
    if (r.ok) {
      Vibration.vibrate(35)
      setAviso({ ok: true, texto: `Cambiada la barra por el QR · ${textoCodigo('QR', c.qr)}` })
      trasAjuste()
    } else {
      setAviso({ ok: false, texto: r.motivo })
    }
    inputRef.current?.focus()
  }

  const ponerTexto = (t: string) => { textoRef.current = t; setTexto(t) }

  // Diagnóstico temporal del lector (adb logcat -s ReactNativeJS): qué llega y con qué pausas.
  const diag = (evento: string, t: string) => {
    const ahora = Date.now()
    const pausa = ultimoEvento.current ? ahora - ultimoEvento.current : 0
    ultimoEvento.current = ahora
    console.log(`[InvScan] ${evento} +${pausa}ms len=${t.length} fin=${JSON.stringify(t.slice(-4))}`)
  }

  // Cuánto esperar sin letras nuevas para dar el código por completo (si no llega ENTER).
  // Un QR a medias (con comas pero sin sus 8 campos) espera más: el lector sigue escribiendo.
  const esperaMs = (t: string) => (t.includes(',') && t.split(',').length < 8 ? 900 : 300)

  const procesarCampo = () => {
    if (debounce.current) clearTimeout(debounce.current)
    const c = textoRef.current
    ponerTexto('')
    if (c) void procesar(c)
  }

  // Lector en modo teclado: si trae ENTER se procesa ya; si no, al terminar la ráfaga.
  const onChangeText = (t: string) => {
    diag('letras', t)
    if (/[\r\n]/.test(t)) {
      if (debounce.current) clearTimeout(debounce.current)
      t.split(/[\r\n]+/).filter(Boolean).forEach(c => { void procesar(c) })
      ponerTexto('')
      return
    }
    ponerTexto(t)
    if (teclado) return   // escribiendo a mano: se procesa con el botón de enviar del teclado
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { diag('espera', textoRef.current); procesarCampo() }, esperaMs(t))
  }

  const onSubmit = () => {
    diag('enter', textoRef.current)
    procesarCampo()
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Solo se finaliza con TODO en el servidor: así lo que el servidor cuenta es lo que se escaneó.
  const avisarPendientes = (pend: number) =>
    Alert.alert('Primero hay que enviar',
      `Tienes ${fmtN(pend)} ${pend === 1 ? 'lectura guardada' : 'lecturas guardadas'} en el equipo que todavía no ` +
      `${pend === 1 ? 'llega' : 'llegan'} al servidor. Para finalizar tienen que estar todas enviadas.\n\n` +
      'No se pierde nada: siguen guardadas y se envían solas cuando haya señal.',
      [
        { text: 'Cerrar', style: 'cancel' },
        { text: 'Enviar ahora', onPress: () => { void motorEnvio.disparar('manual') } },
      ])

  const finalizar = () => {
    const pend = totales(iu).pendientes
    if (pend > 0) return avisarPendientes(pend)
    // La misma talla/color contada por barra suelta Y por QR: casi siempre son las mismas piezas.
    const dob = doblesConteos(iu)
    if (dob.length) {
      return Alert.alert('Revisa antes de finalizar',
        `${dob.length === 1 ? '1 talla/color está contada' : `${dob.length} tallas/colores están contadas`} por barra Y por QR ` +
        '(la barra que va dentro del QR). Si son las mismas piezas, quita esas barras en «Por código»: salen marcadas.',
        [
          { text: 'Revisar', style: 'cancel', onPress: () => { setVista('resumen'); verResumen() } },
          { text: 'Son otras piezas, seguir', style: 'destructive', onPress: confirmarFinalizar },
        ])
    }
    confirmarFinalizar()
  }

  const confirmarFinalizar = () => {
    Alert.alert('Finalizar mi parte',
      `Vas a finalizar con ${fmtN(tot.piezas)} piezas (${fmtN(tot.lecturas)} lecturas). Ya están todas en el servidor.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar', style: 'destructive',
          onPress: async () => {
            // Pudo entrar una lectura mientras el aviso estaba abierto.
            const ahora = totales(iu).pendientes
            if (ahora > 0) return avisarPendientes(ahora)
            await pedirFinalizar(iu); recargar(); void motorEnvio.disparar('manual')
          },
        },
      ])
  }

  const recuperar = async () => {
    setRecuperando(true)
    try {
      let desde = 0
      for (;;) {
        const pag = (await api.bajarLecturas(iu, desde, 2000)).Data ?? []
        if (!pag.length) break
        await importarDelServidor(iu, userCode, pag)
        desde = pag[pag.length - 1].Id
        if (pag.length < 2000) break
      }
      recargar()
      setAviso({ ok: true, texto: 'Lecturas recuperadas del servidor' })
    } catch (e) {
      setAviso({ ok: false, texto: `No se pudo recuperar: ${mensajeDeError(e)}` })
    } finally {
      setRecuperando(false)
    }
  }

  if (!a) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background" padding="$6">
        <Text color="$textMuted" textAlign="center">No se encontró este inventario en el equipo. Vuelve a «Mis inventarios».</Text>
      </YStack>
    )
  }

  const puedeRecuperar = tot.lecturas === 0 && a.lecturas_servidor > 0

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal={compacto ? 10 : 16} paddingTop={compacto ? 6 : 12} gap={compacto ? '$1.5' : '$2.5'}
        width="100%" maxWidth={1000} alignSelf="center">
        {compacto ? (
          <Text fontSize="$3" fontWeight="800" color="$text" numberOfLines={1}>
            {a.cliente}{a.sucursal && a.sucursal !== a.cliente ? ` · ${a.sucursal}` : ''}
          </Text>
        ) : (
          <YStack gap={2}>
            <Text fontSize="$4" fontWeight="800" color="$text" numberOfLines={1}>{a.cliente}</Text>
            <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{a.sucursal} · {a.linea} ({a.tipo_escaneo})</Text>
          </YStack>
        )}

        <XStack gap={compacto ? '$1.5' : '$2'}>
          {[
            { v: tot.piezas, t: 'piezas' }, { v: tot.codigos, t: 'códigos' }, { v: tot.lecturas, t: 'lecturas' },
          ].map(x => compacto ? (
            <XStack key={x.t} flex={1} alignItems="baseline" justifyContent="center" gap={4} paddingVertical={5} borderRadius="$3"
              backgroundColor="$backgroundElevated" borderWidth={1} borderColor="$border">
              <Text fontSize="$5" fontWeight="900" color="$text">{fmtN(x.v)}</Text>
              <Text fontSize="$1" color="$textMuted">{x.t}</Text>
            </XStack>
          ) : (
            <YStack key={x.t} flex={1} alignItems="center" paddingVertical="$2" borderRadius="$4"
              backgroundColor="$backgroundElevated" borderWidth={1} borderColor="$border">
              <Text fontSize="$7" fontWeight="900" color="$text">{fmtN(x.v)}</Text>
              <Text fontSize="$1" color="$textMuted">{x.t}</Text>
            </YStack>
          ))}
        </XStack>

        <BarraEnvio estado={estadoMotor} pendientesAqui={tot.pendientes} lecturasAqui={tot.lecturas} compacta={compacto}
          onPress={() => motorEnvio.disparar('manual')} />

        {!puedeEscanear && (
          <View borderRadius="$4" padding="$3" backgroundColor="rgba(245,158,11,0.12)" borderWidth={1} borderColor="rgba(245,158,11,0.4)">
            <Text fontSize="$3" color={WARN} fontWeight="700">
              {a.finalizar_pedido === 1 ? 'Finalizando: se envía en cuanto haya señal.' : MENSAJE_ESTADO[a.estado] ?? 'No se puede escanear.'}
            </Text>
          </View>
        )}

        {puedeRecuperar && (
          <View onPress={recuperar} pressStyle={{ opacity: 0.85 }} borderRadius="$4" padding="$3" backgroundColor="rgba(59,130,246,0.12)">
            <XStack alignItems="center" gap="$2">
              {recuperando ? <Spinner color="#2563eb" /> : <CloudDownload size={18} color="#2563eb" />}
              <Text flex={1} fontSize="$3" color="#2563eb" fontWeight="700">
                El servidor tiene {fmtN(a.lecturas_servidor)} lecturas tuyas de este inventario. Tócalo para bajarlas y seguir aquí.
              </Text>
            </XStack>
          </View>
        )}

        {puedeEscanear && (
          <>
            {aceptaQR && (
              // Mixto: QR | Barra | QR dañado. Solo QR: QR | QR dañado. Solo barra: sin selector.
              <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" backgroundColor="$backgroundElevated" gap="$1">
                {(a.tipo_escaneo.includes('Barra') ? (['QR', 'BARRA', 'NOENCONTRADO'] as const) : (['QR', 'NOENCONTRADO'] as const)).map(m => {
                  const activo = modo === m || (modo === 'AUTO' && m === 'QR')
                  return (
                    <View key={m} flex={1} onPress={() => { setModo(m); setAviso(null); inputRef.current?.focus() }} pressStyle={{ opacity: 0.85 }}
                      backgroundColor={activo ? (m === 'NOENCONTRADO' ? WARN : ACCENT) : 'transparent'} borderRadius="$3" height={compacto ? 30 : 34}
                      alignItems="center" justifyContent="center">
                      <Text fontWeight="800" fontSize="$2" color={activo ? '#fff' : '$textMuted'}>{MODOS[m]}</Text>
                    </View>
                  )
                })}
              </XStack>
            )}

            <XStack alignItems="center" gap="$2" borderWidth={2} borderColor={ACCENT} borderRadius="$4" paddingHorizontal="$3"
              backgroundColor="$backgroundElevated" height={compacto ? 46 : 54}>
              <ScanLine size={20} color={ACCENT} />
              <TextInput
                ref={inputRef}
                style={{ flex: 1, fontSize: compacto ? 16 : 18, fontWeight: '700', color: theme.text?.val }}
                placeholder={teclado ? 'Escribe el código y pulsa enviar'
                  : modo === 'BARRA' ? 'Escanea la BARRA' : modo === 'NOENCONTRADO' ? 'Escanea la barra (QR dañado)'
                  : aceptaQR ? 'Escanea el QR' : 'Escanea con el lector'}
                placeholderTextColor={theme.textMuted?.val}
                value={texto}
                onChangeText={onChangeText}
                onSubmitEditing={onSubmit}
                showSoftInputOnFocus={teclado}
                autoFocus
                autoCorrect={false}
                autoCapitalize="characters"
                blurOnSubmit={false}
                returnKeyType="send"
                onBlur={() => { if (!camara && !ajuste && !teclado) setTimeout(() => inputRef.current?.focus(), 150) }}
              />
              <View onPress={() => { setTeclado(v => !v); setTimeout(() => inputRef.current?.focus(), 80) }} hitSlop={10} padding="$1">
                <KeyboardIcon size={22} color={teclado ? ACCENT : theme.textMuted?.val} />
              </View>
              <View onPress={() => setCamara(true)} hitSlop={10} padding="$1">
                <CameraIcon size={22} color={theme.textMuted?.val} />
              </View>
            </XStack>

            {!!aviso && (
              <XStack borderRadius="$3" paddingHorizontal="$3" paddingVertical={compacto ? '$1.5' : '$2'} alignItems="center" gap="$2"
                backgroundColor={aviso.ok ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}>
                <Text flex={1} fontSize={compacto ? '$2' : '$3'} fontWeight="800" color={aviso.ok ? OK : ERR} numberOfLines={compacto && !aviso.conflicto && !aviso.danadoRepetido ? 1 : 2}>{aviso.ok ? '✓ ' : '✕ '}{aviso.texto}</Text>
                {aviso.deshacer && (
                  <View onPress={deshacer} hitSlop={8} paddingHorizontal="$2.5" paddingVertical="$1" borderRadius="$2" borderWidth={1} borderColor={OK}>
                    <Text fontSize="$2" fontWeight="800" color={OK}>Deshacer</Text>
                  </View>
                )}
                {!!aviso.danadoRepetido && (
                  <View onPress={() => { const d = aviso.danadoRepetido!; void procesar(d.codigo, 'NOENCONTRADO', true); inputRef.current?.focus() }}
                    hitSlop={8} paddingHorizontal="$2.5" paddingVertical="$1" borderRadius="$2" backgroundColor={WARN}>
                    <Text fontSize="$2" fontWeight="800" color="#fff">Sí, es otra</Text>
                  </View>
                )}
                {!!aviso.conflicto && (
                  <View onPress={() => cambiarPorQR(aviso.conflicto!)} hitSlop={8} paddingHorizontal="$2.5" paddingVertical="$1"
                    borderRadius="$2" backgroundColor={ACCENT}>
                    <Text fontSize="$2" fontWeight="800" color="#fff">Sí, cambiar por QR</Text>
                  </View>
                )}
              </XStack>
            )}
          </>
        )}

        <XStack justifyContent="space-between" alignItems="center">
          <XStack gap="$3">
            {(['lecturas', 'resumen'] as const).map(v => (
              <Text key={v} onPress={() => { setVista(v); if (v === 'resumen') verResumen() }}
                fontSize={compacto ? '$2' : '$3'} fontWeight="800" color={vista === v ? ACCENT : '$textMuted'}>
                {v === 'lecturas' ? 'Últimas lecturas' : 'Por código'}
              </Text>
            ))}
          </XStack>
          {a.puede_escanear === 1 && a.finalizar_pedido !== 1 && (
            // Con pendientes se ve apagado; al tocarlo explica por qué (no se esconde: la impulsadora lo busca).
            <View onPress={finalizar} pressStyle={{ opacity: 0.85 }} flexDirection="row" alignItems="center" gap="$1.5"
              paddingHorizontal="$3" paddingVertical="$1.5" borderRadius="$3"
              backgroundColor={tot.pendientes > 0 ? '$backgroundElevated' : ACCENT}
              borderWidth={1} borderColor={tot.pendientes > 0 ? '$border' : ACCENT}>
              <Flag size={14} color={tot.pendientes > 0 ? theme.textMuted?.val : '#fff'} />
              <Text fontSize="$2" fontWeight="800" color={tot.pendientes > 0 ? '$textMuted' : '#fff'}>Finalizar</Text>
            </View>
          )}
        </XStack>
      </YStack>

      {vista === 'lecturas' ? (
        <FlatList
          data={ultimas}
          keyExtractor={l => l.uuid}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{ paddingHorizontal: compacto ? 10 : 16, paddingTop: compacto ? 4 : 8, paddingBottom: 80, width: '100%', maxWidth: 1000, alignSelf: 'center' }}
          // Mantener presionada (no tocar): en la PDA un toque de más no debe abrir nada.
          renderItem={({ item: l }) => (
            <XStack paddingVertical={compacto ? '$1.5' : '$2'} borderBottomWidth={1} borderColor="$border" alignItems="center" gap="$2"
              onLongPress={puedeEscanear ? () => abrirLinea(l.tipo, l.codigo) : undefined}>
              <Text width={92} fontSize="$1" fontWeight="800" color={l.tipo === 'NOENCONTRADO' ? WARN : ACCENT}>
                {l.es_ajuste ? 'AJUSTE' : l.tipo === 'NOENCONTRADO' ? 'QR DAÑADO' : l.tipo}
              </Text>
              <Text flex={1} fontSize="$2" color="$text" numberOfLines={1}>{textoCodigo(l.tipo, l.codigo)}</Text>
              <Text fontSize="$2" fontWeight="700" color="$text">{l.delta > 0 ? `+${l.delta}` : l.delta}</Text>
              <Text width={54} textAlign="right" fontSize="$1" color={l.rechazo ? ERR : l.enviada ? OK : '$textMuted'}>
                {l.rechazo ? 'rechaz.' : l.enviada ? 'enviada' : l.fecha_equipo.slice(11, 16)}
              </Text>
            </XStack>
          )}
          ListHeaderComponent={puedeEscanear && ultimas.length
            ? <Text fontSize="$1" color="$textMuted" paddingBottom="$1">Mantén presionada una lectura para corregirla o quitarla.</Text> : null}
          ListEmptyComponent={<Text color="$textMuted" textAlign="center" paddingTop="$6">Todavía no hay lecturas.</Text>}
        />
      ) : (
        <FlatList
          data={resumen}
          keyExtractor={r => `${r.tipo}|${r.codigo}`}
          contentContainerStyle={{ paddingHorizontal: compacto ? 10 : 16, paddingTop: compacto ? 4 : 8, paddingBottom: 80, width: '100%', maxWidth: 1000, alignSelf: 'center' }}
          renderItem={({ item: r }) => (
            <XStack paddingVertical="$2.5" borderBottomWidth={1} borderColor="$border" alignItems="center" gap="$2"
              onPress={puedeEscanear ? () => setAjuste(r) : undefined}>
              {r.tipo === 'QR' ? <QrCode size={16} color={ACCENT} /> : <ScanLine size={16} color={r.tipo === 'NOENCONTRADO' ? WARN : ACCENT} />}
              <YStack flex={1}>
                <Text fontSize="$2" color="$text" numberOfLines={1}>{textoCodigo(r.tipo, r.codigo)}</Text>
                {r.tipo === 'BARRA' && dobles.has(r.codigo) && (
                  <Text fontSize="$1" fontWeight="800" color={ERR}>También contada por QR: ¿son las mismas piezas?</Text>
                )}
                {r.tipo === 'NOENCONTRADO' && r.cantidad > 1 && (
                  <Text fontSize="$1" fontWeight="700" color={WARN}>{fmtN(r.cantidad)} con QR dañado: revisa que sean piezas distintas</Text>
                )}
              </YStack>
              <Text fontSize="$4" fontWeight="900" color="$text">{fmtN(r.cantidad)}</Text>
            </XStack>
          )}
          ListHeaderComponent={puedeEscanear ? <Text fontSize="$1" color="$textMuted" paddingBottom="$1">Toca un código para corregir su cantidad o quitarlo.</Text> : null}
        />
      )}

      <CamaraContinua
        abierta={camara}
        aviso={aviso}
        onCerrar={() => { setCamara(false); setTimeout(() => inputRef.current?.focus(), 300) }}
        onLeer={procesar}
      />

      <LineaModal
        item={ajuste}
        onCerrar={() => { setAjuste(null); setTimeout(() => inputRef.current?.focus(), 300) }}
        onGuardar={async n => {
          if (!ajuste) return
          const l = await ajustarCantidad(iu, userCode, ajuste.tipo, ajuste.codigo, n)
          setAjuste(null)
          if (l) trasAjuste()
          setTimeout(() => inputRef.current?.focus(), 300)
        }}
        onQuitar={() => (ajuste ? quitarLinea(ajuste) : Promise.resolve())}
      />
    </View>
  )
}

/** Cámara que sigue leyendo (una pieza tras otra). Ignora el mismo código durante 2 s. */
function CamaraContinua({ abierta, aviso, onCerrar, onLeer }: {
  abierta: boolean; aviso: Aviso; onCerrar: () => void; onLeer: (c: string) => Promise<void>
}) {
  const [perm, setPerm] = useState<boolean | null>(null)
  const ultimo = useRef<{ c: string; t: number }>({ c: '', t: 0 })

  useEffect(() => {
    if (!abierta) return
    if (Platform.OS !== 'android') { setPerm(true); return }
    setPerm(null)
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
      .then(g => setPerm(g === PermissionsAndroid.RESULTS.GRANTED))
      .catch(() => setPerm(false))
  }, [abierta])

  const leer = (event: any) => {
    const raw = event?.nativeEvent?.codeStringValue ?? event?.codeStringValue ?? event?.nativeEvent?.code ?? ''
    const c = String(raw).trim()
    const ahora = Date.now()
    if (!c || (c === ultimo.current.c && ahora - ultimo.current.t < 2000)) return
    ultimo.current = { c, t: ahora }
    void onLeer(c)
  }

  return (
    <Modal visible={abierta} animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="#000">
        {abierta && perm === true && (
          <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={leer} scanThrottleDelay={300} />
        )}
        {abierta && perm === false && (
          <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal="$6">
            <Text color="#fff" textAlign="center">Sin permiso de cámara. Habilítalo en los ajustes o usa el lector.</Text>
          </YStack>
        )}
        <YStack position="absolute" top={0} left={0} right={0} paddingTop="$8" paddingHorizontal="$4" gap="$2">
          <XStack alignItems="center" justifyContent="space-between">
            <Text color="#fff" fontSize="$5" fontWeight="800">Escaneo con cámara</Text>
            <View onPress={onCerrar} width={40} height={40} borderRadius={20} alignItems="center" justifyContent="center" backgroundColor="rgba(0,0,0,0.5)">
              <X size={24} color="#fff" />
            </View>
          </XStack>
          {!!aviso && (
            <View borderRadius="$3" padding="$2" backgroundColor={aviso.ok ? 'rgba(22,163,74,0.85)' : 'rgba(220,38,38,0.85)'}>
              <Text color="#fff" fontWeight="800" numberOfLines={2}>{aviso.texto}</Text>
            </View>
          )}
        </YStack>
      </View>
    </Modal>
  )
}

/**
 * Corregir o quitar una línea. Sin campo de texto a propósito: el lector de la PDA escribe
 * como teclado y con un campo enfocado un escaneo metería los 13 dígitos como cantidad.
 * Quitar pide un segundo toque («Sí, quitar») y después se puede deshacer: en pantalla
 * chica un dedo de más no debe borrar nada.
 */
function LineaModal({ item, onCerrar, onGuardar, onQuitar }: {
  item: ResumenCodigo | null; onCerrar: () => void; onGuardar: (n: number) => Promise<void>; onQuitar: () => Promise<void>
}) {
  const theme = useTheme()
  const [n, setN] = useState(0)
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setN(item?.cantidad ?? 0); setConfirmar(false); setOcupado(false) }, [item])
  if (!item) return null

  const esQR = item.tipo === 'QR'
  const hacer = (fn: () => Promise<void>) => async () => {
    if (ocupado) return
    setOcupado(true)
    try { await fn() } finally { setOcupado(false) }
  }
  const boton = (texto: string, onPress: () => void, tono: 'normal' | 'primario' | 'peligro' = 'normal', deshabilitado = false) => (
    <View flex={1} onPress={deshabilitado ? undefined : onPress} height={44} borderRadius="$3" alignItems="center" justifyContent="center"
      opacity={deshabilitado ? 0.45 : 1} borderWidth={1}
      borderColor={tono === 'peligro' ? ERR : tono === 'primario' ? ACCENT : '$border'}
      backgroundColor={tono === 'peligro' ? ERR : tono === 'primario' ? ACCENT : 'transparent'}>
      <Text fontWeight="800" color={tono === 'normal' ? '$text' : '#fff'}>{texto}</Text>
    </View>
  )
  const paso = (icono: React.ReactNode, onPress: () => void, deshabilitado: boolean) => (
    <View onPress={deshabilitado ? undefined : onPress} width={52} height={52} borderRadius={26} alignItems="center" justifyContent="center"
      borderWidth={1} borderColor="$border" opacity={deshabilitado ? 0.4 : 1}>{icono}</View>
  )

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.5)" justifyContent="center" padding="$4">
        <YStack backgroundColor="$backgroundElevated" borderRadius="$5" padding="$4" gap="$3">
          <Text fontSize="$5" fontWeight="800" color="$text">
            {confirmar ? (esQR ? '¿Quitar este QR?' : '¿Quitar esta línea?') : esQR ? 'Pieza con QR' : 'Corregir cantidad'}
          </Text>
          <YStack gap={2}>
            <Text fontSize="$3" fontWeight="700" color="$text">{textoCodigo(item.tipo, item.codigo)}</Text>
            <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{item.codigo}</Text>
          </YStack>

          {confirmar ? (
            <>
              <Text fontSize="$3" color="$text">
                Se {item.cantidad === 1 ? 'resta 1 pieza' : `restan ${fmtN(item.cantidad)} piezas`} de tu conteo. Queda registrado como un ajuste y se puede deshacer enseguida.
              </Text>
              <XStack gap="$2">
                {boton('No, volver', () => setConfirmar(false))}
                {boton('Sí, quitar', hacer(onQuitar), 'peligro', ocupado)}
              </XStack>
            </>
          ) : esQR ? (
            <>
              <Text fontSize="$2" color="$textMuted">Cada QR es una pieza. Si lo escaneaste por error, puedes quitarlo.</Text>
              <XStack gap="$2" alignItems="center">
                <Text flex={1} fontSize="$2" fontWeight="700" color={ERR} onPress={() => setConfirmar(true)} paddingVertical="$2">Quitar este QR</Text>
                {boton('Cerrar', onCerrar)}
              </XStack>
            </>
          ) : (
            <>
              <XStack alignItems="center" justifyContent="center" gap="$4">
                {paso(<Minus size={24} color={theme.text?.val} />, () => setN(v => Math.max(0, v - 1)), n <= 0)}
                <Text fontSize="$9" fontWeight="900" color={n === item.cantidad ? '$text' : ACCENT} minWidth={70} textAlign="center">{fmtN(n)}</Text>
                {paso(<Plus size={24} color={theme.text?.val} />, () => setN(v => v + 1), false)}
              </XStack>
              <Text fontSize="$1" color="$textMuted" textAlign="center">
                Tenías {fmtN(item.cantidad)}. Se guarda como un ajuste: queda registrado quién y cuándo lo cambió.
              </Text>
              <XStack gap="$2" alignItems="center">
                <Text flex={1} fontSize="$2" fontWeight="700" color={ERR} onPress={() => setConfirmar(true)} paddingVertical="$2">Quitar línea</Text>
                {boton('Cancelar', onCerrar)}
                {boton('Guardar', n === 0 ? () => setConfirmar(true) : hacer(() => onGuardar(n)), 'primario', n === item.cantidad || ocupado)}
              </XStack>
            </>
          )}
          <Text fontSize="$1" color="$textMuted">Con esta ventana abierta el lector no registra: ciérrala para seguir escaneando.</Text>
        </YStack>
      </View>
    </Modal>
  )
}
