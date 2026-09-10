import React, { useCallback, useMemo, useRef, useState } from 'react'
import { FlatList, RefreshControl, ScrollView as RNScrollView } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { FileText, Search, X, ClipboardList, CalendarDays } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import AppInput from '../../components/commons/AppInput'
import AppDatePicker from '../../components/commons/AppDatePicker'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { salidaFacturasService } from '../../api/modules/salidaFacturas/salidaFacturas.service'
import { ISalidaCDHistorial, TipoSalidaCD } from '../../api/modules/salidaFacturas/salidaFacturas.types'
import { ACCENT, EstadoBadge, fmtCantidad, fmtFechaHora } from './components'
import { SalidaDetalleModal } from './SalidaDetalleModal'

/**
 * Historial del Control de Salida del CD: qué se revisó, qué ya salió y quién lo
 * atendió. Trae las DOS cosas que salen por esa puerta —facturas y diarios de
 * inventario— en un solo listado, porque son la misma revisión.
 *
 * Tocar una fila abre el detalle de SOLO CONSULTA con lo que llevaba. Lo pidió
 * quien revisa: el listado decía «4/4 artículos, 14 piezas» pero no QUÉ eran, y
 * para lo que ya salió no había otra forma de mirarlo (la pantalla de la puerta
 * lo rechaza justamente porque ya salió).
 *
 * ── LOS FILTROS OCUPABAN MEDIA PANTALLA ────────────────────────────────────
 * Eran cuatro filas —dos cajas de texto, un selector de fecha y un botón
 * Buscar— antes de ver el primer movimiento. Ahora son dos:
 *
 *   1. UNA sola caja de búsqueda, con la lupa adentro (así no hace falta la
 *      fila del botón: se busca con la lupa o con la tecla de retorno).
 *   2. Una fila de chips que scrollea: tipo y período.
 *
 * ⚠ La caja única decide sola contra qué campo buscar, porque el servidor los
 * combina con AND y buscar «GARCIA» en el número no devolvería nada. La regla
 * es «si el texto trae algún dígito es un número, si no es un cliente»: los
 * códigos siempre traen dígitos (incluidos los `HN18…`) y los nombres no.
 * Y como es una regla adivinada, NO se esconde: debajo se dice por cuál está
 * buscando y se puede cambiar con un toque. Un nombre con número («COMERCIAL
 * 2000») es el caso raro que eso resuelve.
 *
 * El servidor devuelve los 200 movimientos más recientes YA ORDENADOS entre los
 * dos tipos (el tope se aplica en SQL sobre el conjunto, no 200 de cada uno).
 * Los filtros bajan a la BD —no se filtra en el teléfono— para que buscar algo
 * viejo sí lo encuentre.
 */

type Periodo = 'HOY' | 'D7' | 'TODO' | 'DIA'
type Campo = 'codigo' | 'cliente'

/* La fecha de HOY armada con la hora LOCAL, no con toISOString(): en Honduras
   (UTC-6) el ISO devuelve el día siguiente a partir de las 18:00, así que
   «Hoy» habría dejado de mostrar lo de la tarde. Es el mismo error de husos
   que ya se corrigió en el corte por fecha de este módulo. */
function isoLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function haceDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoLocal(d)
}

/** true = el texto parece un número de documento (trae al menos un dígito). */
const pareceCodigo = (t: string) => /\d/.test(t)

export default function SalidaFacturasHistorialScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Historial de salidas</Text>,
  })

  const theme = useTheme()
  const { showToast } = useShowToast()

  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState<'' | TipoSalidaCD>('')
  const [periodo, setPeriodo] = useState<Periodo>('TODO')
  const [fechaExacta, setFechaExacta] = useState<string | null>(null)
  // null = se deduce del texto; si el usuario lo cambia a mano, manda lo que eligió.
  const [campoForzado, setCampoForzado] = useState<Campo | null>(null)

  const [filas, setFilas] = useState<ISalidaCDHistorial[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Lo que se está consultando en el detalle (solo lectura).
  const [detalle, setDetalle] = useState<{ codigo: string; tipo: TipoSalidaCD } | null>(null)

  const campo: Campo = campoForzado ?? (pareceCodigo(busqueda) ? 'codigo' : 'cliente')

  // Los filtros se leen por ref, no por dependencia del callback: si `cargar`
  // cambiara de identidad con cada tecla, el useFocusEffect se volvería a
  // disparar y habría una consulta por letra escrita.
  const filtrosRef = useRef<any>(null)
  filtrosRef.current = { busqueda, campo, tipo, periodo, fechaExacta }

  const cargar = useCallback(async (override?: any) => {
    const f = override ?? filtrosRef.current
    const texto = (f.busqueda || '').trim()
    try {
      const res = await salidaFacturasService.historialCD({
        tipo: f.tipo || undefined,
        codigo: texto && f.campo === 'codigo' ? texto : undefined,
        cliente: texto && f.campo === 'cliente' ? texto : undefined,
        fecha: f.periodo === 'HOY' ? isoLocal(new Date())
             : f.periodo === 'DIA' ? (f.fechaExacta || undefined)
             : undefined,
        // «7 días» son hoy y los seis anteriores, o sea siete días contando hoy.
        desde: f.periodo === 'D7' ? haceDias(6) : undefined,
        hasta: f.periodo === 'D7' ? isoLocal(new Date()) : undefined,
      })
      if (res.Success) setFilas(res.Data ?? [])
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar el historial')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
  }, [showToast])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const buscar = () => { setCargando(true); cargar() }

  // Los chips se aplican al toque: son un recorte, no algo que cueste escribir.
  const elegirTipo = (t: '' | TipoSalidaCD) => {
    setTipo(t)
    setCargando(true)
    cargar({ ...filtrosRef.current, tipo: t })
  }

  const elegirPeriodo = (p: Periodo) => {
    setPeriodo(p)
    if (p !== 'DIA') setFechaExacta(null)
    // 'DIA' no consulta todavía: espera a que se elija el día.
    if (p === 'DIA') return
    setCargando(true)
    cargar({ ...filtrosRef.current, periodo: p, fechaExacta: null })
  }

  const elegirDia = (dia: string | null) => {
    setFechaExacta(dia)
    if (!dia) return
    setCargando(true)
    cargar({ ...filtrosRef.current, periodo: 'DIA', fechaExacta: dia })
  }

  const cambiarCampo = () => {
    const otro: Campo = campo === 'codigo' ? 'cliente' : 'codigo'
    setCampoForzado(otro)
    setCargando(true)
    cargar({ ...filtrosRef.current, campo: otro })
  }

  const limpiar = () => {
    setBusqueda(''); setTipo(''); setPeriodo('TODO'); setFechaExacta(null); setCampoForzado(null)
    setCargando(true)
    cargar({ busqueda: '', campo: 'codigo', tipo: '', periodo: 'TODO', fechaExacta: null })
  }

  const hayFiltros = !!busqueda.trim() || !!tipo || periodo !== 'TODO'

  const resumen = useMemo(() => ({
    total: filas.length,
    salidas: filas.filter(f => (f.Estado ?? '').toUpperCase() === 'COMPLETADA').length,
    diarios: filas.filter(f => f.Tipo === 'DIARIO').length,
  }), [filas])

  const renderItem = ({ item }: { item: ISalidaCDHistorial }) => {
    const estado = (item.Estado ?? '').toUpperCase()
    const completada = estado === 'COMPLETADA'
    const descartada = estado === 'DESCARTADA'
    const diario = item.Tipo === 'DIARIO'
    // El nombre del guardia va guardado en el registro (no se resuelve al leer:
    // el historial vive en IMDesarrollos y Security.Users en IMCore, otro servidor).
    const guardia = completada ? item.GuardiaSalida : item.GuardiaInicio
    return (
      <View onPress={() => item.Codigo && setDetalle({ codigo: item.Codigo, tipo: item.Tipo })}
        pressStyle={{ opacity: 0.7 }}
        backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
        padding="$3.5" marginBottom="$3" gap="$1.5" {...shadows.sm}>
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          {diario ? <ClipboardList size={18} color={ACCENT} /> : <FileText size={18} color={ACCENT} />}
          <Text fontSize="$5" fontWeight="900" color="$text">{item.Codigo}</Text>
          <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2}
            backgroundColor={diario ? 'rgba(147,51,234,0.15)' : 'rgba(59,130,246,0.15)'}>
            <Text fontSize="$1" fontWeight="800" color={diario ? '#9333ea' : '#3b82f6'}>
              {diario ? 'DIARIO' : 'FACTURA'}
            </Text>
          </View>
          <EstadoBadge estado={item.Estado} />
        </XStack>

        <Text fontSize="$3" color="$text" numberOfLines={2}>
          {(diario ? item.Descripcion : item.Cliente) || (diario ? 'Sin descripción' : 'Sin cliente')}
        </Text>

        {/* En un diario, el TIPO y la categoría son el dato que dice si lo
            revisado corresponde: por eso va a la vista y no escondido. */}
        {diario && (!!item.TipoDiario || !!item.CategoriaNombre) && (
          <Text fontSize="$1" color="$textMuted">
            {[item.TipoDiario, item.CategoriaNombre].filter(Boolean).join(' · ')}
            {item.AlmacenOrigen
              ? ` · ${item.AlmacenOrigen}${item.AlmacenDestino ? ` → ${item.AlmacenDestino}` : ''}`
              : ''}
          </Text>
        )}

        <XStack gap="$3" flexWrap="wrap">
          <Text fontSize="$2" color="$textMuted">
            Artículos <Text fontWeight="800" color="$text">{item.LineasRevisadas}/{item.TotalLineas}</Text>
          </Text>
          <Text fontSize="$2" color="$textMuted">
            Piezas <Text fontWeight="800" color="$text">{fmtCantidad(item.TotalPiezas)}</Text>
          </Text>
          {!!item.PedidoVenta && <Text fontSize="$2" color="$textMuted">Pedido {item.PedidoVenta}</Text>}
        </XStack>

        <XStack alignItems="center" justifyContent="space-between" gap="$2">
          <Text fontSize="$1" color="$textMuted" flex={1}>
            {completada
              ? `Salió ${fmtFechaHora(item.FechaSalida)}`
              : descartada
                ? `Descartada ${fmtFechaHora(item.FechaDescarte)}`
                : `En revisión desde ${fmtFechaHora(item.FechaInicio)}`}
            {guardia && !descartada ? ` · ${guardia}` : ''}
            {descartada && item.GuardiaDescarte ? ` · ${item.GuardiaDescarte}` : ''}
          </Text>
          {/* Que se puede tocar hay que decirlo: una tarjeta no se ve tocable. */}
          <Text fontSize="$1" color={ACCENT} fontWeight="800">Ver detalle</Text>
        </XStack>

        {descartada && !!item.MotivoDescarte && (
          <Text fontSize="$1" color="$textMuted">Motivo: {item.MotivoDescarte}</Text>
        )}
      </View>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      {/* ── Filtros: dos filas ─────────────────────────────────────────────── */}
      <YStack paddingHorizontal={16} paddingTop={12} gap="$2" width="100%" maxWidth={1000} alignSelf="center">
        <AppInput
          /* La etiqueta dice qué se puede buscar y no «Buscar»: en reposo la
             etiqueta va DENTRO del campo y es lo único que se lee, así que
             «Buscar» dejaba al usuario sin saber si acepta un cliente. */
          label="Factura, diario o cliente"
          value={busqueda}
          onChangeText={t => { setBusqueda(t); setCampoForzado(null) }}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={buscar}
          rightElement={
            <XStack alignItems="center" gap="$2">
              {!!busqueda && (
                <View onPress={limpiar} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
                  <X size={18} color={theme.textMuted?.val} />
                </View>
              )}
              {/* La lupa adentro reemplaza la fila entera del botón Buscar. */}
              <View onPress={buscar} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
                <Search size={20} color={ACCENT} />
              </View>
            </XStack>
          }
        />

        {/* La regla de a qué campo va el texto es adivinada, así que se dice y se
            puede cambiar. Solo aparece cuando hay algo escrito. */}
        {!!busqueda.trim() && (
          <XStack alignItems="center" gap="$2" marginTop={-4}>
            <Text fontSize="$1" color="$textMuted">
              Buscando por {campo === 'codigo' ? 'número' : 'cliente'}
            </Text>
            <View onPress={cambiarCampo} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
              <Text fontSize="$1" color={ACCENT} fontWeight="800">
                buscar por {campo === 'codigo' ? 'cliente' : 'número'}
              </Text>
            </View>
          </XStack>
        )}

        <ChipsFila>
          <Chip activo={tipo === ''} onPress={() => elegirTipo('')}>Todos</Chip>
          <Chip activo={tipo === 'FACTURA'} onPress={() => elegirTipo('FACTURA')}>Facturas</Chip>
          <Chip activo={tipo === 'DIARIO'} onPress={() => elegirTipo('DIARIO')}>Diarios</Chip>
          <View width={1} height={20} backgroundColor="$border" marginHorizontal="$1" />
          <Chip activo={periodo === 'HOY'} onPress={() => elegirPeriodo('HOY')}>Hoy</Chip>
          <Chip activo={periodo === 'D7'} onPress={() => elegirPeriodo('D7')}>7 días</Chip>
          <Chip activo={periodo === 'TODO'} onPress={() => elegirPeriodo('TODO')}>Todo</Chip>
          <Chip activo={periodo === 'DIA'} onPress={() => elegirPeriodo('DIA')} icono>
            {fechaExacta ? fechaExacta.split('-').reverse().slice(0, 2).join('/') : 'Otro día'}
          </Chip>
        </ChipsFila>

        {/* El selector de día completo solo ocupa espacio cuando se pidió. */}
        {periodo === 'DIA' && (
          <AppDatePicker mode="single" label="Día" value={fechaExacta} onChange={elegirDia} direction="past" />
        )}

        {!cargando && filas.length > 0 && (
          <Text fontSize="$2" color="$textMuted">
            {resumen.total} {resumen.total === 1 ? 'movimiento' : 'movimientos'} · {resumen.salidas} ya salieron
            {resumen.diarios > 0 ? ` · ${resumen.diarios} ${resumen.diarios === 1 ? 'diario' : 'diarios'}` : ''}
          </Text>
        )}
      </YStack>

      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando historial…</Text>
        </YStack>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={f => `${f.Tipo}-${f.DataAreaId}-${f.Codigo}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, width: '100%', maxWidth: 1000, alignSelf: 'center' }}
          refreshControl={
            <RefreshControl refreshing={refrescando} colors={[ACCENT]} tintColor={ACCENT}
              onRefresh={() => { setRefrescando(true); cargar() }} />
          }
          ListEmptyComponent={
            <YStack alignItems="center" justifyContent="center" paddingTop="$10" gap="$3">
              <ClipboardList size={48} color={theme.textMuted?.val} />
              <Text color="$textMuted" textAlign="center">
                {hayFiltros
                  ? 'Nada coincide con la búsqueda.'
                  : 'Todavía no se ha revisado nada en el control de salida.'}
              </Text>
            </YStack>
          }
        />
      )}

      <SalidaDetalleModal
        codigo={detalle?.codigo ?? null}
        tipo={detalle?.tipo}
        onClose={() => setDetalle(null)}
      />
    </View>
  )
}

// ── Chips ───────────────────────────────────────────────────────────────────
// Scrollean en horizontal: en un teléfono angosto los siete no caben, y
// envolverlos a dos líneas devolvería el espacio que se vino a recuperar.

function ChipsFila({ children }: { children: React.ReactNode }) {
  /* ⚠ Tiene que ser un ScrollView de verdad. Con `overflow="scroll"` en una
     XStack los chips se RECORTAN pero NO scrollean —eso es CSS, no React
     Native—, y los últimos («Todo», «Otro día») quedaban inalcanzables. */
  return (
    <RNScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 8 }}>
      {children}
    </RNScrollView>
  )
}

function Chip({
  activo,
  onPress,
  icono,
  children,
}: {
  activo: boolean
  onPress: () => void
  icono?: boolean
  children: React.ReactNode
}) {
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.7 }}
      flexShrink={0}
      borderRadius={999}
      borderWidth={1}
      borderColor={activo ? ACCENT : '$border'}
      backgroundColor={activo ? ACCENT : 'transparent'}
      paddingHorizontal="$3"
      height={32}
      flexDirection="row"
      alignItems="center"
      gap="$1.5"
    >
      {icono && <CalendarDays size={13} color={activo ? '#fff' : '#9ca3af'} />}
      <Text fontSize="$2" fontWeight="800" color={activo ? '#fff' : '$textMuted'}>{children}</Text>
    </View>
  )
}
