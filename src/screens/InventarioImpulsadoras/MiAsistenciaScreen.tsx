import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Image, Modal, PermissionsAndroid, Platform, RefreshControl, ScrollView, TextInput } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import {
  Camera, CircleCheck, Clock, CloudOff, CloudUpload, History, MapPin, Smartphone, Store, TriangleAlert, X,
} from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { launchCamera } from 'react-native-image-picker'
import { NotificationBell } from '../../components/notifications/NotificationBell'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { asistenciaService as api } from '../../api/modules/inventarioImpulsadoras/asistencia.service'
import {
  IAgenda, IAgendaTienda, IAgendaTurno, IMiMarca, TipoMarca,
} from '../../api/modules/inventarioImpulsadoras/asistencia.types'
import {
  MarcaVista, guardarMarca, leerAgenda, marcasDeTurno, marcasRecientes, monotono, siguienteMarca,
} from '../../services/inventarioImpulsadoras/asistenciaLocal'
import { motorAsistencia, EstadoAsistencia } from '../../services/inventarioImpulsadoras/motorAsistencia'
import { buscarUbicacion, LecturaGps } from '../../services/inventarioImpulsadoras/gps'
import { ahoraLocal } from '../../services/inventarioImpulsadoras/baseLocal'
import { ACCENT, ERR, OK, WARN, fmtFecha, haceCuanto } from './components'

// Inventario Clientes › Mi asistencia. La impulsadora marca inicio, almuerzo y fin de su turno.
// FUNCIONA SIN SEÑAL: la agenda (turnos, tiendas, reglas) está guardada en el teléfono, la marca
// se guarda en el teléfono con la hora y la coordenada (el GPS no necesita internet) y el motor
// la sube sola cuando vuelve la señal. Nada la bloquea: si algo no cuadra (lejos, sin GPS, sin
// turno) la marca se guarda igual y la oficina la revisa.

const TIPO: Record<TipoMarca, { label: string; boton: string }> = {
  INICIO: { label: 'Inicio', boton: 'Marcar inicio' },
  SALIDA_ALMUERZO: { label: 'Salida a almuerzo', boton: 'Salir a almuerzo' },
  REGRESO_ALMUERZO: { label: 'Regreso de almuerzo', boton: 'Regresar de almuerzo' },
  FIN: { label: 'Fin', boton: 'Marcar salida' },
}
const ORDEN: TipoMarca[] = ['INICIO', 'SALIDA_ALMUERZO', 'REGRESO_ALMUERZO', 'FIN']

const MOTIVO: Record<string, string> = {
  FUERA_RADIO: 'lejos de la tienda', SIN_GPS: 'sin ubicación', PRECISION_BAJA: 'GPS impreciso',
  TIENDA_SIN_UBICACION: 'tienda sin ubicación', SIN_TURNO: 'sin turno', RELOJ: 'hora del teléfono dudosa',
  SIMULADA: 'ubicación simulada', REPETIDA: 'repetida', SIN_FOTO: 'sin foto',
}
const motivosTexto = (m: string | null | undefined) =>
  (m ?? '').split(',').filter(Boolean).map(x => MOTIVO[x] ?? x).join(', ')

/** Distancia en metros (Haversine), para avisar ANTES de guardar si está lejos. */
function distancia(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))))
}
const fmtMetros = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)

const hoy = () => ahoraLocal().slice(0, 10)
const diaTexto = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function useEstadoAsistencia(): EstadoAsistencia {
  const [e, setE] = useState<EstadoAsistencia>(() => motorAsistencia.estadoActual())
  useEffect(() => motorAsistencia.suscribir(setE), [])
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t) }, [])
  return e
}

type Destino = { tipo: TipoMarca; turno: IAgendaTurno | null; tienda: IAgendaTienda | null }

export default function MiAsistenciaScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const userCode = user?.Code ?? ''
  const estado = useEstadoAsistencia()

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Mi asistencia</Text>,
    right: <NotificationBell size={20} />,
  })

  const [agenda, setAgenda] = useState<IAgenda | null>(null)
  const [destino, setDestino] = useState<Destino | null>(null)
  const [elegirTienda, setElegirTienda] = useState(false)
  const [historial, setHistorial] = useState<IMiMarca[] | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  const pintar = useCallback(() => {
    if (!userCode) return
    setAgenda(leerAgenda(userCode)?.agenda ?? null)
  }, [userCode])

  const cargarHistorial = useCallback(async () => {
    try { setHistorial((await api.misMarcas(7)).Data ?? []) } catch { /* sin señal: se muestra lo del teléfono */ }
  }, [])

  useFocusEffect(useCallback(() => {
    if (!userCode) return
    motorAsistencia.iniciar(userCode)
    pintar()
    void motorAsistencia.disparar('manual').then(pintar)
    void cargarHistorial()
  }, [userCode, pintar, cargarHistorial]))

  // El motor avisa cuando bajó la agenda o subió algo: se repinta con lo del teléfono.
  useEffect(() => { pintar() }, [estado.version, estado.agendaAt, pintar])

  const refrescar = async () => {
    setRefrescando(true)
    try { await motorAsistencia.disparar('manual'); pintar(); await cargarHistorial() } finally { setRefrescando(false) }
  }

  const dia = hoy()
  const turnosHoy = useMemo(() => (agenda?.Turnos ?? []).filter(t => t.Fecha === dia), [agenda, dia])
  const proximos = useMemo(() => (agenda?.Turnos ?? []).filter(t => t.Fecha > dia).slice(0, 6), [agenda, dia])
  const marcasAgenda = agenda?.Marcas ?? []
  // Lo marcado sin turno hoy (por tienda), del teléfono y del servidor.
  const sinTurno = useMemo(() => {
    if (!userCode) return [] as { tienda: IAgendaTienda | null; sucursalId: number | null; marcas: MarcaVista[] }[]
    const ids = new Set<number | null>()
    for (const m of marcasRecientes(userCode, 1)) if (m.turno_id == null && m.fecha_telefono.slice(0, 10) === dia) ids.add(m.sucursal_id)
    for (const m of marcasAgenda) if (m.Turno_Id == null && m.FechaHoraTelefono.slice(0, 10) === dia) ids.add(m.Sucursal_Id)
    return [...ids].map(id => ({
      sucursalId: id,
      tienda: (agenda?.Tiendas ?? []).find(t => t.Sucursal_Id === id) ?? null,
      marcas: marcasDeTurno(userCode, marcasAgenda, dia, null, id),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCode, agenda, dia, estado.version])

  const bloqueo = agenda && !agenda.PuedeMarcar
    ? 'Tu usuario no tiene la asistencia activada. Pídela a tu administradora.'
    : agenda && !agenda.Activa ? 'La asistencia está apagada por la oficina. Lo que ya marcaste se sigue enviando.' : null

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}>
        <Franja estado={estado} onPress={() => motorAsistencia.disparar('manual')} />

        {!agenda && (
          <Aviso color={WARN} icono={<CloudOff size={18} color={WARN} />}
            texto="Todavía no tengo tus turnos en este teléfono: se bajan solos la primera vez que haya señal. Igual puedes marcar en una tienda." />
        )}
        {bloqueo && <Aviso color={ERR} icono={<TriangleAlert size={18} color={ERR} />} texto={bloqueo} />}

        <Text fontSize="$5" fontWeight="800" color="$text">{diaTexto(dia)}</Text>

        {turnosHoy.map(t => {
          const hechas = marcasDeTurno(userCode, marcasAgenda, dia, t.Id, t.Sucursal_Id)
          return (
            <TarjetaTurno key={t.Id} turno={t} hechas={hechas} deshabilitado={!!bloqueo}
              onMarcar={tipo => setDestino({ tipo, turno: t, tienda: null })} />
          )
        })}

        {!turnosHoy.length && agenda && (
          <YStack padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border" gap="$1">
            <Text fontSize="$4" fontWeight="700" color="$text">Hoy no tienes turno programado</Text>
            <Text fontSize="$2" color="$textMuted">
              {agenda.PermitirSinTurno
                ? 'Si estás trabajando en una tienda, puedes marcar igual: la oficina lo revisa.'
                : 'Si deberías estar trabajando, avísale a tu administradora.'}
            </Text>
          </YStack>
        )}

        {sinTurno.map(g => {
          const sig = siguienteMarca(g.marcas, true)
          return (
            <YStack key={String(g.sucursalId)} padding="$3" borderRadius="$4" borderWidth={1} borderColor={WARN} gap="$2">
              <XStack alignItems="center" gap="$2">
                <Store size={18} color={WARN} />
                <Text flex={1} fontSize="$4" fontWeight="700" color="$text">{g.tienda?.Tienda ?? 'Otra tienda'} (sin turno)</Text>
              </XStack>
              <ListaMarcas hechas={g.marcas} />
              {sig && !bloqueo && (
                <BotonGrande texto={TIPO[sig].boton} onPress={() => setDestino({ tipo: sig, turno: null, tienda: g.tienda })} />
              )}
              {sig === 'SALIDA_ALMUERZO' && !bloqueo && (
                <EnlaceSalida onPress={() => setDestino({ tipo: 'FIN', turno: null, tienda: g.tienda })} />
              )}
            </YStack>
          )
        })}

        {(agenda?.PermitirSinTurno ?? true) && !bloqueo && (
          <View padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border" borderStyle="dashed"
            onPress={() => setElegirTienda(true)} pressStyle={{ opacity: 0.8 }}>
            <XStack alignItems="center" gap="$2">
              <Store size={18} color={ACCENT} />
              <Text flex={1} fontSize="$3" fontWeight="700" color={ACCENT}>
                {turnosHoy.length ? 'Marcar en otra tienda (sin turno)' : 'Marcar en una tienda'}
              </Text>
            </XStack>
          </View>
        )}

        {proximos.length > 0 && (
          <YStack gap="$2" marginTop="$2">
            <Text fontSize="$3" fontWeight="800" color="$textMuted">PRÓXIMOS TURNOS</Text>
            {proximos.map(t => (
              <XStack key={t.Id} padding="$2.5" borderRadius="$3" borderWidth={1} borderColor="$border" gap="$2" alignItems="center">
                <YStack flex={1}>
                  <Text fontSize="$3" fontWeight="700" color="$text">{diaTexto(t.Fecha)}</Text>
                  <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{t.Tienda} · {t.Cliente}</Text>
                </YStack>
                <Text fontSize="$3" fontWeight="700" color="$text">{t.HoraInicio}–{t.HoraFin}</Text>
              </XStack>
            ))}
          </YStack>
        )}

        <Historial userCode={userCode} servidor={historial} version={estado.version} />
      </ScrollView>

      {destino && (
        <ModalMarcar destino={destino} agenda={agenda} userCode={userCode}
          onCerrar={() => setDestino(null)}
          onGuardada={() => { setDestino(null); motorAsistencia.avisarMarca(); pintar() }} />
      )}
      <ElegirTienda abierto={elegirTienda} tiendas={agenda?.Tiendas ?? []} onCerrar={() => setElegirTienda(false)}
        onElegir={t => {
          setElegirTienda(false)
          const hechas = marcasDeTurno(userCode, marcasAgenda, dia, null, t?.Sucursal_Id ?? null)
          const sig = siguienteMarca(hechas, true) ?? 'INICIO'
          setDestino({ tipo: sig, turno: null, tienda: t })
        }} />
    </YStack>
  )
}

// ── Franja de envío ─────────────────────────────────────────────────────────

function Franja({ estado, onPress }: { estado: EstadoAsistencia; onPress: () => void }) {
  const { enviando, marcasPendientes, fotosPendientes, ultimoError, sinRed, agendaAt, ultimoEnvioOk } = estado
  const pend = marcasPendientes + fotosPendientes
  const todo = pend === 0
  const color = todo ? OK : sinRed || ultimoError ? WARN : ACCENT
  const Icono = todo ? CircleCheck : sinRed || ultimoError ? CloudOff : CloudUpload
  const texto = enviando
    ? `Enviando… ${pend} por enviar`
    : todo
      ? `Todo enviado${ultimoEnvioOk ? ` · ${haceCuanto(ultimoEnvioOk)}` : ''}`
      : sinRed
        ? `${marcasPendientes ? `${marcasPendientes} ${marcasPendientes === 1 ? 'marca guardada' : 'marcas guardadas'} en el teléfono` : `${fotosPendientes} ${fotosPendientes === 1 ? 'foto' : 'fotos'} por enviar`} · Sin señal: se envían solas cuando vuelva`
        : `${pend} por enviar${ultimoError ? ` · ${ultimoError}` : ''}`
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.85 }} borderRadius="$4" paddingHorizontal="$3" paddingVertical="$2.5"
      backgroundColor={`${color}22`} borderWidth={1} borderColor={`${color}55`}>
      <XStack alignItems="center" gap="$2">
        {enviando ? <Spinner size="small" color={color} /> : <Icono size={18} color={color} />}
        <YStack flex={1} gap={2}>
          <Text fontSize="$3" fontWeight="700" color={color}>{texto}</Text>
          <Text fontSize="$1" color={color} opacity={0.85}>
            {agendaAt ? `Turnos actualizados ${haceCuanto(agendaAt)}` : 'Turnos sin bajar todavía'}
          </Text>
        </YStack>
        {!todo && !enviando && <Text fontSize="$2" fontWeight="800" color={color}>ENVIAR</Text>}
      </XStack>
    </View>
  )
}

function Aviso({ color, icono, texto }: { color: string; icono: React.ReactNode; texto: string }) {
  return (
    <XStack padding="$3" borderRadius="$4" backgroundColor={`${color}18`} borderWidth={1} borderColor={`${color}55`} gap="$2" alignItems="center">
      {icono}
      <Text flex={1} fontSize="$2" color="$text">{texto}</Text>
    </XStack>
  )
}

function BotonGrande({ texto, onPress, color = ACCENT }: { texto: string; onPress: () => void; color?: string }) {
  return (
    <View height={54} borderRadius="$4" backgroundColor={color} alignItems="center" justifyContent="center"
      onPress={onPress} pressStyle={{ opacity: 0.85, scale: 0.99 }}>
      <XStack alignItems="center" gap="$2">
        <MapPin size={20} color="#fff" />
        <Text fontSize="$5" fontWeight="800" color="#fff">{texto}</Text>
      </XStack>
    </View>
  )
}

// ── Turno de hoy ────────────────────────────────────────────────────────────

function TarjetaTurno({ turno: t, hechas, deshabilitado, onMarcar }: {
  turno: IAgendaTurno; hechas: MarcaVista[]; deshabilitado: boolean; onMarcar: (tipo: TipoMarca) => void
}) {
  const conAlmuerzo = !!t.HoraSalidaAlm
  const sig = siguienteMarca(hechas, conAlmuerzo)
  const hizoInicio = hechas.some(h => h.tipo === 'INICIO')
  const enAlmuerzo = hechas.some(h => h.tipo === 'SALIDA_ALMUERZO') && !hechas.some(h => h.tipo === 'REGRESO_ALMUERZO')
  return (
    <YStack padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong" gap="$2.5">
      <XStack alignItems="flex-start" gap="$2">
        <Store size={20} color={ACCENT} />
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="800" color="$text">{t.Tienda}</Text>
          {t.Cliente !== t.Tienda && <Text fontSize="$2" color="$textMuted">{t.Cliente}</Text>}
          {!!t.Direccion && <Text fontSize="$2" color="$textMuted" numberOfLines={2}>{t.Direccion}</Text>}
        </YStack>
      </XStack>
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <XStack gap="$1.5" alignItems="center"><Clock size={15} color={theme_muted} /><Text fontSize="$3" fontWeight="700" color="$text">{t.HoraInicio}–{t.HoraFin}</Text></XStack>
        {conAlmuerzo && <Text fontSize="$2" color="$textMuted">almuerzo {t.HoraSalidaAlm}–{t.HoraRegresoAlm}</Text>}
        {t.FotoObligatoria && <XStack gap="$1" alignItems="center"><Camera size={14} color={WARN} /><Text fontSize="$2" color={WARN}>con foto</Text></XStack>}
      </XStack>
      {!!t.Comentario && <Text fontSize="$2" color="$text">«{t.Comentario}»</Text>}

      <ListaMarcas hechas={hechas} programado={t} />

      {deshabilitado ? null : sig ? (
        <YStack gap="$2">
          <BotonGrande texto={TIPO[sig].boton} onPress={() => onMarcar(sig)} />
          {/* Almuerzo no programado: igual se puede marcar (la mitad de los días lo usan). */}
          {sig === 'FIN' && hizoInicio && !conAlmuerzo && !enAlmuerzo && !hechas.some(h => h.tipo === 'SALIDA_ALMUERZO') && (
            <Text fontSize="$2" fontWeight="700" color={ACCENT} textAlign="center" onPress={() => onMarcar('SALIDA_ALMUERZO')}>
              Salir a almuerzo
            </Text>
          )}
          {/* Entró tarde o no almuerza: puede irse sin marcar el almuerzo. */}
          {sig === 'SALIDA_ALMUERZO' && <EnlaceSalida onPress={() => onMarcar('FIN')} />}
        </YStack>
      ) : (
        <XStack alignItems="center" gap="$2" justifyContent="center" paddingVertical="$1">
          <CircleCheck size={18} color={OK} />
          <Text fontSize="$3" fontWeight="800" color={OK}>Turno terminado</Text>
        </XStack>
      )}
    </YStack>
  )
}
const theme_muted = '#9ca3af'

function EnlaceSalida({ onPress }: { onPress: () => void }) {
  return (
    <Text fontSize="$2" fontWeight="700" color={ACCENT} textAlign="center" onPress={onPress}>
      Marcar salida (sin almuerzo)
    </Text>
  )
}

function ListaMarcas({ hechas, programado }: { hechas: MarcaVista[]; programado?: IAgendaTurno }) {
  const prog: Partial<Record<TipoMarca, string | null>> = programado
    ? { INICIO: programado.HoraInicio, SALIDA_ALMUERZO: programado.HoraSalidaAlm, REGRESO_ALMUERZO: programado.HoraRegresoAlm, FIN: programado.HoraFin }
    : {}
  const tipos = ORDEN.filter(t => hechas.some(h => h.tipo === t) || (programado && prog[t]))
  if (!tipos.length) return null
  return (
    <XStack gap="$2" flexWrap="wrap">
      {tipos.map(tp => {
        const h = [...hechas].reverse().find(x => x.tipo === tp)
        const color = !h ? '$textMuted' : h.estado === 'EN_TELEFONO' ? ACCENT : h.estado === 'POR_REVISAR' ? WARN : OK
        return (
          <YStack key={tp} minWidth={74} flexGrow={1} flexBasis={0} padding="$2" borderRadius="$3" borderWidth={1}
            borderColor={h ? (typeof color === 'string' && color.startsWith('#') ? `${color}66` : '$border') : '$border'} alignItems="center" gap={2}>
            <Text fontSize="$1" color="$textMuted" numberOfLines={1}>{TIPO[tp].label}</Text>
            <Text fontSize="$4" fontWeight="800" color={color}>{h ? h.fecha.slice(11, 16) : prog[tp] ?? '—'}</Text>
            {h && (
              <XStack alignItems="center" gap={3}>
                {h.estado === 'EN_TELEFONO' && <Smartphone size={11} color={ACCENT} />}
                <Text fontSize={10} color={color}>
                  {h.estado === 'EN_TELEFONO' ? 'en el teléfono' : h.estado === 'POR_REVISAR' ? 'por revisar' : 'enviada'}
                </Text>
              </XStack>
            )}
          </YStack>
        )
      })}
    </XStack>
  )
}

// ── Marcar ──────────────────────────────────────────────────────────────────

const requestCameraPermission = async () => {
  if (Platform.OS !== 'android') return true
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Permiso de cámara', message: 'Para la foto de tu marca de asistencia', buttonPositive: 'OK',
  })
  return granted === PermissionsAndroid.RESULTS.GRANTED
}

function ModalMarcar({ destino, agenda, userCode, onCerrar, onGuardada }: {
  destino: Destino; agenda: IAgenda | null; userCode: string; onCerrar: () => void; onGuardada: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { tipo, turno, tienda } = destino
  // La hora que cuenta es la del toque, no la de cuando terminó de buscar el GPS.
  const momento = useRef({ fecha: ahoraLocal().slice(0, 19), mono: monotono() })
  const corte = useRef<(() => void) | null>(null)
  const [buscando, setBuscando] = useState(true)
  const [restan, setRestan] = useState<number | null>(null)
  const [mejor, setMejor] = useState<number | null>(null)
  const [gps, setGps] = useState<LecturaGps | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)

  const fotoObligatoria = turno ? turno.FotoObligatoria : !!agenda?.FotoObligatoria
  const lugar = turno ? { lat: turno.Latitud, lng: turno.Longitud, radio: turno.Radio, nombre: turno.Tienda }
    : tienda ? { lat: tienda.Latitud, lng: tienda.Longitud, radio: tienda.Radio, nombre: tienda.Tienda } : null

  useEffect(() => {
    const b = buscarUbicacion(agenda?.EsperaGpsSeg ?? 15, 20, (r, m) => { setRestan(r); setMejor(m) })
    corte.current = b.cortar
    let vivo = true
    b.resultado.then(r => { if (vivo) { setGps(r); setBuscando(false) } })
    return () => { vivo = false; b.cortar() }
  }, [agenda?.EsperaGpsSeg])

  const dist = gps?.ok && lugar?.lat != null && lugar?.lng != null
    ? distancia({ lat: gps.lat, lng: gps.lng }, { lat: Number(lugar.lat), lng: Number(lugar.lng) }) : null
  const lejos = dist != null && lugar ? dist > lugar.radio : false

  const tomarFoto = async () => {
    if (!(await requestCameraPermission())) {
      Alert.alert('Sin permiso de cámara', 'Activa el permiso de cámara de IMCore en los ajustes del teléfono.')
      return
    }
    launchCamera({ mediaType: 'photo', quality: 0.6, maxWidth: 1024, maxHeight: 1024, includeBase64: true, cameraType: 'front', saveToPhotos: false },
      res => {
        if (res.didCancel || res.errorCode) return
        const b64 = res.assets?.[0]?.base64
        if (b64) setFoto(b64)
      })
  }

  const guardar = async () => {
    if (fotoObligatoria && !foto) {
      const seguir = await new Promise<boolean>(resolve => Alert.alert('Falta la foto',
        'Este turno pide foto. Si la guardas sin foto, la marca queda por revisar.',
        [{ text: 'Tomar foto', onPress: () => resolve(false) }, { text: 'Guardar sin foto', style: 'destructive', onPress: () => resolve(true) }]))
      if (!seguir) { void tomarFoto(); return }
    }
    setGuardando(true)
    try {
      await guardarMarca(userCode, {
        tipo, turnoId: turno?.Id ?? null, sucursalId: turno?.Sucursal_Id ?? tienda?.Sucursal_Id ?? null,
        tienda: turno?.Tienda ?? tienda?.Tienda ?? null,
        fechaTelefono: momento.current.fecha, mono: momento.current.mono,
        lat: gps?.ok ? gps.lat : null, lng: gps?.ok ? gps.lng : null, prec: gps?.ok ? gps.prec : null,
        gpsFecha: gps?.ok ? gps.fecha : null, simulada: gps?.ok ? gps.simulada : null,
        sinGps: gps && !gps.ok ? gps.motivo : gps ? null : 'TIMEOUT',
        comentario: comentario.trim() || null, fotoBase64: foto,
      })
      onGuardada()
    } catch (e: any) {
      // Escribir en el teléfono casi nunca falla; si falla, que lo sepa: la marca NO quedó.
      Alert.alert('No se pudo guardar la marca', `Intenta otra vez. (${e?.message ?? 'error del teléfono'})`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCerrar} presentationStyle="fullScreen">
      <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 8} paddingBottom={insets.bottom + 12}>
        <XStack paddingHorizontal="$3" alignItems="center" gap="$2">
          <YStack flex={1}>
            <Text fontSize="$6" fontWeight="800" color="$text">{TIPO[tipo].label}</Text>
            <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{lugar?.nombre ?? 'Otra tienda'} · {momento.current.fecha.slice(11, 16)}</Text>
          </YStack>
          <View width={44} height={44} borderRadius={22} borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center"
            onPress={onCerrar} pressStyle={{ opacity: 0.7 }} hitSlop={12} accessibilityLabel="Cerrar">
            <X size={20} color={theme.text?.val} />
          </View>
        </XStack>

        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          {buscando ? (
            <YStack padding="$4" borderRadius="$4" borderWidth={1} borderColor="$border" alignItems="center" gap="$2">
              <Spinner size="large" color={ACCENT} />
              <Text fontSize="$4" fontWeight="700" color="$text">Buscando tu ubicación…</Text>
              <Text fontSize="$2" color="$textMuted" textAlign="center">
                {mejor != null ? `Precisión ±${mejor} m` : 'Funciona sin internet; cerca de una ventana o afuera es más rápido.'}
                {restan != null ? ` · ${restan} s` : ''}
              </Text>
              <Text fontSize="$2" fontWeight="700" color={ACCENT} onPress={() => corte.current?.()}>Marcar sin esperar</Text>
            </YStack>
          ) : gps?.ok ? (
            <Aviso color={lejos ? WARN : OK} icono={<MapPin size={18} color={lejos ? WARN : OK} />}
              texto={dist == null
                ? `Ubicación lista (±${Math.round(gps.prec)} m). ${lugar ? 'La tienda no tiene ubicación cargada: la oficina lo revisa.' : ''}`
                : lejos
                  ? `Estás a ${fmtMetros(dist)} de la tienda (más de ${lugar!.radio} m). Puedes marcar igual: la oficina lo revisa.`
                  : `Estás en la tienda (a ${fmtMetros(dist)}, ±${Math.round(gps.prec)} m).`} />
          ) : (
            <Aviso color={WARN} icono={<TriangleAlert size={18} color={WARN} />}
              texto={gps?.ok === false && gps.motivo === 'PERMISO'
                ? 'IMCore no tiene permiso de ubicación. Puedes marcar igual (quedará por revisar), pero actívalo en los ajustes del teléfono.'
                : gps?.ok === false && gps.motivo === 'APAGADO'
                  ? 'La ubicación del teléfono está apagada. Puedes marcar igual (quedará por revisar).'
                  : 'No se obtuvo tu ubicación a tiempo. Puedes marcar igual (quedará por revisar).'} />
          )}

          {(fotoObligatoria || foto) ? (
            <YStack gap="$2">
              <Text fontSize="$3" fontWeight="700" color="$text">Foto {fotoObligatoria ? '(la pide tu turno)' : ''}</Text>
              {foto ? (
                <XStack gap="$3" alignItems="center">
                  <Image source={{ uri: `data:image/jpeg;base64,${foto}` }} style={{ width: 84, height: 84, borderRadius: 10 }} />
                  <Text fontSize="$3" fontWeight="700" color={ACCENT} onPress={tomarFoto}>Tomar otra</Text>
                </XStack>
              ) : (
                <View height={48} borderRadius="$4" borderWidth={1} borderColor={ACCENT} alignItems="center" justifyContent="center"
                  onPress={tomarFoto} pressStyle={{ opacity: 0.8 }}>
                  <XStack gap="$2" alignItems="center"><Camera size={18} color={ACCENT} /><Text fontWeight="800" color={ACCENT}>Tomar foto</Text></XStack>
                </View>
              )}
            </YStack>
          ) : (
            <Text fontSize="$2" fontWeight="700" color="$textMuted" onPress={tomarFoto}>+ Agregar foto (opcional)</Text>
          )}

          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="700" color="$text">Comentario (opcional)</Text>
            <TextInput value={comentario} onChangeText={setComentario} placeholder="Ej.: la tienda abrió tarde" maxLength={300}
              placeholderTextColor={theme.textMuted?.val} multiline
              style={{ minHeight: 48, maxHeight: 100, fontSize: 15, color: theme.text?.val, borderWidth: 1,
                       borderColor: theme.border?.val, borderRadius: 8, padding: 8, textAlignVertical: 'top' }} />
          </YStack>
        </ScrollView>

        <YStack paddingHorizontal="$3" gap="$1.5">
          <View height={54} borderRadius="$4" backgroundColor={ACCENT} alignItems="center" justifyContent="center"
            opacity={buscando || guardando ? 0.5 : 1} onPress={buscando || guardando ? undefined : guardar} pressStyle={{ opacity: 0.85 }}>
            {guardando ? <Spinner color="#fff" /> : <Text fontSize="$5" fontWeight="800" color="#fff">Guardar marca</Text>}
          </View>
          <Text fontSize="$1" color="$textMuted" textAlign="center">
            Se guarda en el teléfono al instante y se envía sola cuando haya señal.
          </Text>
        </YStack>
      </YStack>
    </Modal>
  )
}

function ElegirTienda({ abierto, tiendas, onCerrar, onElegir }: {
  abierto: boolean; tiendas: IAgendaTienda[]; onCerrar: () => void; onElegir: (t: IAgendaTienda | null) => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={abierto} animationType="slide" onRequestClose={onCerrar} transparent>
      <YStack flex={1} justifyContent="flex-end" backgroundColor="rgba(0,0,0,0.45)">
        <YStack backgroundColor="$background" borderTopLeftRadius={16} borderTopRightRadius={16} paddingBottom={insets.bottom + 12} maxHeight="80%">
          <XStack padding="$3" alignItems="center">
            <Text flex={1} fontSize="$5" fontWeight="800" color="$text">¿En qué tienda estás?</Text>
            <View width={44} height={44} borderRadius={22} borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center"
              onPress={onCerrar} hitSlop={12} accessibilityLabel="Cerrar"><X size={20} color={theme.text?.val} /></View>
          </XStack>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingBottom: 8 }}>
            {tiendas.map(t => (
              <XStack key={t.Sucursal_Id} padding="$3" borderRadius="$3" borderWidth={1} borderColor="$border" gap="$2" alignItems="center"
                onPress={() => onElegir(t)} pressStyle={{ opacity: 0.8 }}>
                <Store size={18} color={ACCENT} />
                <YStack flex={1}>
                  <Text fontSize="$3" fontWeight="700" color="$text">{t.Tienda}</Text>
                  <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{t.Cliente}</Text>
                </YStack>
              </XStack>
            ))}
            <XStack padding="$3" borderRadius="$3" borderWidth={1} borderColor="$border" borderStyle="dashed" gap="$2" alignItems="center"
              onPress={() => onElegir(null)} pressStyle={{ opacity: 0.8 }}>
              <Store size={18} color={theme.textMuted?.val} />
              <Text flex={1} fontSize="$3" fontWeight="700" color="$textMuted">Otra tienda (no está en la lista)</Text>
            </XStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  )
}

// ── Historial ───────────────────────────────────────────────────────────────

function Historial({ userCode, servidor, version }: { userCode: string; servidor: IMiMarca[] | null; version: number }) {
  // Lo del servidor (con su estado y la respuesta de la oficina) + lo que el teléfono todavía no envía.
  const filas = useMemo(() => {
    const m = new Map<string, { uuid: string; tipo: TipoMarca; fecha: string; tienda: string | null; estado: string; motivos: string | null; nota: string | null }>()
    for (const s of servidor ?? []) {
      m.set(s.Uuid.toLowerCase(), { uuid: s.Uuid, tipo: s.Tipo, fecha: s.FechaHora, tienda: s.Tienda, estado: s.Estado, motivos: s.Motivos, nota: s.ComentarioRevision })
    }
    if (userCode) {
      for (const l of marcasRecientes(userCode, 7)) {
        if (l.enviada && m.has(l.uuid)) continue
        m.set(l.uuid, { uuid: l.uuid, tipo: l.tipo, fecha: l.fecha_telefono, tienda: l.tienda,
          estado: l.enviada ? (l.estado ?? 'VALIDA') : 'EN_TELEFONO', motivos: l.motivos, nota: null })
      }
    }
    return [...m.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servidor, userCode, version])

  if (!filas.length) return null
  const etiqueta: Record<string, { t: string; c: string }> = {
    EN_TELEFONO: { t: 'En el teléfono', c: ACCENT }, VALIDA: { t: 'Válida', c: OK }, POR_REVISAR: { t: 'Por revisar', c: WARN },
    APROBADA: { t: 'Aprobada', c: OK }, RECHAZADA: { t: 'Rechazada', c: ERR },
  }
  return (
    <YStack gap="$2" marginTop="$2">
      <XStack alignItems="center" gap="$2"><History size={16} color={theme_muted} /><Text fontSize="$3" fontWeight="800" color="$textMuted">MIS MARCAS (7 DÍAS)</Text></XStack>
      {filas.map(f => (
        <XStack key={f.uuid} paddingVertical="$2" borderBottomWidth={1} borderColor="$border" gap="$2" alignItems="center">
          <YStack flex={1}>
            <Text fontSize="$3" fontWeight="700" color="$text">{TIPO[f.tipo]?.label ?? f.tipo} · {fmtFecha(f.fecha)} {f.fecha.slice(11, 16)}</Text>
            {!!f.tienda && <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{f.tienda}</Text>}
            {f.estado === 'POR_REVISAR' && !!f.motivos && <Text fontSize="$1" color={WARN}>{motivosTexto(f.motivos)}</Text>}
            {!!f.nota && <Text fontSize="$1" color={f.estado === 'RECHAZADA' ? ERR : '$textMuted'}>Oficina: {f.nota}</Text>}
          </YStack>
          <Text fontSize="$1" fontWeight="800" color={etiqueta[f.estado]?.c ?? '$textMuted'}>{etiqueta[f.estado]?.t ?? f.estado}</Text>
        </XStack>
      ))}
    </YStack>
  )
}
