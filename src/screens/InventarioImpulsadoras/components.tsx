import React, { useEffect, useRef, useState } from 'react'
import { Spinner, Text, XStack, YStack, View } from 'tamagui'
import { CloudOff, CloudUpload, CircleCheck } from 'lucide-react-native'
import { motorEnvio, EstadoMotor } from '../../services/inventarioImpulsadoras/motorEnvio'

export const ACCENT = '#FF551A'
export const OK = '#16a34a'
export const WARN = '#f59e0b'
export const ERR = '#dc2626'

export const ESTADO_ASIG: Record<string, { label: string; bg: string; fg: string }> = {
  ACTIVA: { label: 'ACTIVA', bg: 'rgba(34,197,94,0.15)', fg: OK },
  FINALIZADA: { label: 'MI PARTE FINALIZADA', bg: 'rgba(59,130,246,0.15)', fg: '#2563eb' },
  CERRADO: { label: 'CERRADO', bg: 'rgba(107,114,128,0.18)', fg: '#6b7280' },
  DESACTIVADO: { label: 'DESACTIVADO', bg: 'rgba(239,68,68,0.15)', fg: ERR },
  QUITADA: { label: 'QUITADA', bg: 'rgba(239,68,68,0.15)', fg: ERR },
}

export const fmtN = (n: number) => (n ?? 0).toLocaleString('es-HN')

/** % hecho; nunca dice 100 si falta algo (1,199 de 1,200 no es «100%»). */
export const pctDe = (hechas: number, total: number) =>
  total <= 0 ? 0 : hechas >= total ? 100 : Math.min(99, Math.floor((hechas * 100) / total))

/** Barra delgada de avance con el % a la derecha. */
export function BarraAvance({ pct, color }: { pct: number; color: string }) {
  return (
    <XStack alignItems="center" gap="$2">
      <View flex={1} height={5} borderRadius={3} backgroundColor={`${color}33`} overflow="hidden">
        <View height={5} width={`${pct}%`} borderRadius={3} backgroundColor={color} />
      </View>
      <Text fontSize="$1" fontWeight="800" color={color} minWidth={32} textAlign="right">{pct}%</Text>
    </XStack>
  )
}

/**
 * Cómo se muestra un código. El QR de Denim trae «producto,talla,color,barra,estilo,…»
 * (el cierre toma [0] producto, [1] talla, [2] color, igual que el viejo): se muestra
 * «10 11 33 07 783 0008 · talla 26 · color 28» en vez del texto crudo.
 */
export function textoCodigo(tipo: string, codigo: string) {
  if (tipo !== 'QR') return codigo
  const f = codigo.split(',').map(x => x.trim())
  return f.length >= 3 ? `${f[0]} · talla ${f[1]} · color ${f[2]}` : codigo
}

export const fmtFecha = (iso?: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const fmtFechaHora = (iso?: string | null) => (iso ? `${fmtFecha(iso)} ${iso.slice(11, 16)}` : '')

export const haceCuanto = (ms: number | null) => {
  if (!ms) return 'nunca'
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'hace un momento'
  const m = Math.round(s / 60)
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`
}

export function useEstadoMotor(): EstadoMotor {
  const [e, setE] = useState<EstadoMotor>(() => motorEnvio.estadoActual())
  useEffect(() => motorEnvio.suscribir(setE), [])
  // Re-render cada 20 s para que «hace X min» no se quede congelado.
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 20_000); return () => clearInterval(t) }, [])
  return e
}

const hora = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/**
 * Franja de estado del envío: lo primero que la impulsadora tiene que poder leer.
 * - `pendientesAqui`: dentro de un inventario la franja habla de ESE inventario; lo pendiente de otros
 *   va aparte (sin esto, un inventario vacío decía «40 guardadas sin enviar» por las de otro).
 *   Con `lecturasAqui` además muestra cuánto de ese inventario ya está en el servidor.
 * - Mientras envía: «Enviando… X de Y» con barra (Y crece si se escanea mientras tanto).
 * - `onPress` devuelve la promesa del intento: la franja muestra el RESULTADO del toque. Sin señal un
 *   intento falla en milisegundos y, si solo se repinta lo mismo, el botón parece muerto.
 */
export function BarraEnvio({ estado, onPress, pendientesAqui, lecturasAqui, compacta }: {
  estado: EstadoMotor; onPress?: () => Promise<unknown> | void; pendientesAqui?: number; lecturasAqui?: number
  /** Pantalla chica: menos alto; solo el detalle más importante. */
  compacta?: boolean
}) {
  const { enviando, ultimoEnvioOk, ultimoError, ultimoIntento, reintentoEn, sinRed, progreso } = estado
  const enInventario = pendientesAqui !== undefined
  const pendientes = enInventario ? pendientesAqui : estado.pendientes
  const otros = enInventario ? Math.max(0, estado.pendientes - pendientesAqui) : 0

  const [tocado, setTocado] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const tocar = onPress && (async () => {
    if (timer.current) clearTimeout(timer.current)
    setResultado(null)
    setTocado(true)
    const inicio = Date.now()
    try { await onPress() } catch { /* el motor ya publica el error */ }
    // Un mínimo de ~1 s de «Intentando…» para que el toque se vea aunque falle al instante.
    await new Promise(r => setTimeout(r, Math.max(0, 1000 - (Date.now() - inicio))))
    const e = motorEnvio.estadoActual()
    setTocado(false)
    setResultado(e.ultimoError
      ? { ok: false, texto: `Intentado a las ${hora(Date.now())}: no se pudo enviar. Lo escaneado sigue guardado.` }
      : { ok: true, texto: `Enviado a las ${hora(Date.now())}` })
    timer.current = setTimeout(() => setResultado(null), 6000)
  })

  const ocupado = enviando || tocado
  const todoEnviado = pendientes === 0 && (enInventario || !ultimoError)
  const problema = !todoEnviado && (!!ultimoError || sinRed)
  const color = todoEnviado ? OK : problema ? WARN : ACCENT
  const Icono = todoEnviado ? CircleCheck : problema ? CloudOff : CloudUpload
  const cuantas = `${fmtN(pendientes)}${enInventario ? ' de este inventario' : ''}`
  const avance = enviando && progreso && progreso.total > 0 ? progreso : null
  const texto = avance
    ? `Enviando… ${fmtN(avance.enviadas)} de ${fmtN(avance.total)}`
    : ocupado
    ? `Intentando enviar… ${fmtN(pendientes)} por enviar`
    : todoEnviado
      ? enInventario ? 'Este inventario: todo en el servidor' : `Todo enviado · ${haceCuanto(ultimoEnvioOk)}`
      : sinRed
        ? `${cuantas} guardadas en el equipo · Sin señal: se envían solas cuando vuelva`
        : ultimoError
          ? `${cuantas} guardadas en el equipo, sin enviar · ${ultimoError}`
          : `${cuantas} por enviar`
  const detalles: string[] = []
  if (resultado) detalles.push(resultado.texto)
  else if (!ocupado && problema && ultimoIntento) {
    detalles.push(`Último intento ${hora(ultimoIntento)}`
      + (reintentoEn && reintentoEn > Date.now() ? ` · el próximo sale solo a las ${hora(reintentoEn)}` : ''))
  }
  if (otros > 0) detalles.push(`Además hay ${fmtN(otros)} de otros inventarios sin enviar`)
  const visibles = compacta ? detalles.slice(0, 1) : detalles
  // La barra: el envío en curso, o (dentro de un inventario) cuánto de él ya está en el servidor.
  const pctBarra = avance
    ? pctDe(avance.enviadas, avance.total)
    : enInventario && lecturasAqui && pendientes > 0 ? pctDe(lecturasAqui - pendientes, lecturasAqui) : null
  return (
    <View onPress={tocar || undefined} pressStyle={{ opacity: 0.85 }} borderRadius="$4" paddingHorizontal="$3"
      paddingVertical={compacta ? '$1.5' : '$2.5'}
      backgroundColor={`${color}22`} borderWidth={1} borderColor={`${color}55`}>
      <XStack alignItems="center" gap="$2">
        {ocupado ? <Spinner size="small" color={color} /> : <Icono size={18} color={color} />}
        <YStack flex={1} gap={2}>
          <Text fontSize={compacta ? '$2' : '$3'} fontWeight="700" color={color} numberOfLines={2}>{texto}</Text>
          {pctBarra !== null && <BarraAvance pct={pctBarra} color={color} />}
          {visibles.map(d => (
            <Text key={d} numberOfLines={compacta ? 1 : undefined} fontSize="$1" fontWeight={d === resultado?.texto ? '800' : '400'}
              color={d === resultado?.texto ? (resultado.ok ? OK : ERR) : color} opacity={0.9}>{d}</Text>
          ))}
        </YStack>
        {!!onPress && (!todoEnviado || otros > 0) && !ocupado && <Text fontSize="$2" fontWeight="800" color={color}>ENVIAR</Text>}
      </XStack>
    </View>
  )
}
