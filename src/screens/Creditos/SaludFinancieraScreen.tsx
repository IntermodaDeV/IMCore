import React, { useCallback, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useThemeName } from 'tamagui'
import { CalendarClock, TriangleAlert } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { saludFinancieraService as svc } from '../../api/modules/creditos/saludFinanciera.service'
import { ISaludFinanciera } from '../../api/modules/creditos/saludFinanciera.types'
import { shadows } from '../../theme/shadows'
import { ACCENT } from './components'

/* ============================================================================
   SALUD FINANCIERA en el teléfono — SOLO los números que se miran de pie.

   Cuánto se debe, qué parte está vencida, cuánto de eso pasó los 60 días, y
   quiénes son los que más deben. El desglose por asesor y la tendencia quedan
   en el web, que tiene el ancho para mostrarlos.

   La empresa arranca en Honduras y todo va en DÓLARES: con cuatro países, un
   total en moneda local no se puede comparar (y sumar cuatro monedas es
   justamente el defecto del reporte que esto viene a reemplazar). El cambio a
   moneda local existe en el web, donde hay lugar para explicarlo.
   ============================================================================ */

const EMPRESAS = [
  { v: 'imhn', txt: 'HN' },
  { v: 'imgt', txt: 'GT' },
  { v: 'imcr', txt: 'CR' },
  { v: 'imsl', txt: 'SV' },
  { v: '', txt: 'Todas' },
]

/* Los cuatro tramos son una escala ORDENADA de gravedad, no categorías: rampa de
   UN solo tono, claro→oscuro. Los mismos hexes ya validados en el web con el
   script de la skill dataviz contra las dos superficies. */
const TRAMOS = (oscuro: boolean) => oscuro
  ? ['#f6b9a4', '#ea8064', '#d64a4a', '#a83232']
  : ['#ee9d86', '#e5735a', '#d03b3b', '#8f2323']

const NOMBRE_TRAMO = ['1 a 29 días', '30 a 60 días', '61 a 270 días', 'Más de 270 días']
const CATEGORIA = ['Al día', 'Mora A', 'Mora B', 'Mora C', 'Mora D']

export default function SaludFinancieraScreen() {
  const nombreTema = useThemeName()
  const oscuro = String(nombreTema).includes('dark')
  const { showToast } = useShowToast()

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Salud Financiera</Text>,
  })

  const [empresa, setEmpresa] = useState('imhn')
  const [datos, setDatos] = useState<ISaludFinanciera | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await svc.getCorte(empresa)
      if (res.Success) setDatos(res.Data)
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intentá de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar la cartera')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa])

  useFocusEffect(useCallback(() => { setCargando(true); cargar() }, [cargar]))

  const r = datos?.Resumen

  /** Abreviado siempre: en el teléfono, seis cifras con separadores no se leen. */
  const dinero = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(2)} M`
    if (abs >= 1_000) return `$ ${Math.round(n / 1000).toLocaleString('es-HN')} K`
    return `$ ${Math.round(n).toLocaleString('es-HN')}`
  }
  const fecha = (s?: string | null) =>
    s ? new Date(s).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

  const colores = TRAMOS(oscuro)

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={refrescando} tintColor={ACCENT}
          onRefresh={() => { setRefrescando(true); cargar() }} />
      }
    >
      {/* Selector de país. Cinco opciones caben en una fila: un desplegable
          sería un toque más para algo que se cambia todo el tiempo. */}
      <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1"
        backgroundColor="$backgroundElevated" gap="$1">
        {EMPRESAS.map(e => (
          <View key={e.v || 'todas'} flex={1} onPress={() => setEmpresa(e.v)}
            pressStyle={{ opacity: 0.85 }}
            backgroundColor={empresa === e.v ? ACCENT : 'transparent'} borderRadius="$3" height={34}
            alignItems="center" justifyContent="center">
            <Text fontWeight="800" fontSize="$2" color={empresa === e.v ? '#fff' : '$textMuted'}>
              {e.txt}
            </Text>
          </View>
        ))}
      </XStack>

      {cargando ? (
        <YStack alignItems="center" paddingTop="$8"><Spinner size="large" color={ACCENT} /></YStack>
      ) : !r ? (
        <Text color="$textMuted" textAlign="center" paddingTop="$6">Sin datos en este corte.</Text>
      ) : (
        <>
          {/* De cuándo es el dato. Nunca en letra chica: un corte de tres
              semanas se ve idéntico a uno de hoy si no se dice. */}
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <CalendarClock size={14} color={r.DiasDelCorte > 3 ? '#ea580c' : undefined} />
            <Text fontSize="$2" color={r.DiasDelCorte > 3 ? '#ea580c' : '$textMuted'}>
              Corte del {fecha(r.FechaCorte)}
              {r.DiasDelCorte > 0 && ` · hace ${r.DiasDelCorte} día${r.DiasDelCorte === 1 ? '' : 's'}`}
            </Text>
          </XStack>

          {/* El % vencido es EL número: la cartera creció 41% en el año y aun
              así el vencido casi se duplicó. Un monto que sube no distingue
              esos dos casos, el porcentaje sí. */}
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
            borderColor="$border" padding="$4" gap="$1" {...shadows.sm}>
            <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">
              Cartera vencida
            </Text>
            <XStack alignItems="baseline" gap="$2">
              <Text fontSize={44} fontWeight="900" lineHeight={50}
                color={r.PctVencido >= 20 ? colores[2] : '$text'}>
                {r.PctVencido}%
              </Text>
              <Text fontSize="$4" color="$textMuted">{dinero(r.Vencido)}</Text>
            </XStack>
            <Text fontSize="$2" color="$textMuted">
              de {dinero(r.Cartera)} en {r.Clientes} clientes
            </Text>
          </YStack>

          <XStack gap="$3">
            <Mini titulo="Más de 60 días" valor={`${r.PctCritico}%`}
              pie={`${dinero(r.Critico)} · ${r.ClientesCriticos} clientes`}
              color={r.PctCritico >= 5 ? colores[3] : undefined} />
            <Mini titulo="Clientes con mora" valor={String(r.ClientesConMora)}
              pie={`de ${r.Clientes} · ${r.PctClientesConMora}%`} />
          </XStack>

          {r.FilasSinTasa > 0 && (
            <XStack alignItems="center" gap="$2" backgroundColor="rgba(239,68,68,0.10)"
              borderRadius="$3" padding="$3">
              <TriangleAlert size={15} color="#dc2626" />
              <Text fontSize="$2" color="#dc2626" flex={1}>
                {r.FilasSinTasa} documentos sin tipo de cambio: el total está corto.
              </Text>
            </XStack>
          )}

          {/* Tramos */}
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
            borderColor="$border" padding="$3.5" gap="$3" {...shadows.sm}>
            <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">
              En qué tramo está lo vencido
            </Text>
            {[r.Tramo_1_29, r.Tramo_30_60, r.Tramo_61_270, r.Tramo_271].map((monto, i) => {
              const pct = r.Vencido > 0 ? (monto * 100) / r.Vencido : 0
              return (
                <YStack key={i} gap="$1.5">
                  <XStack justifyContent="space-between" alignItems="baseline">
                    <Text fontSize="$2" color="$text">{NOMBRE_TRAMO[i]}</Text>
                    <XStack gap="$2" alignItems="baseline">
                      <Text fontSize="$3" fontWeight="700" color="$text">{dinero(monto)}</Text>
                      <Text fontSize="$1" color="$textMuted">{pct.toFixed(0)}%</Text>
                    </XStack>
                  </XStack>
                  <View height={8} borderRadius={4} backgroundColor="rgba(148,163,184,0.25)" overflow="hidden">
                    <View height={8} borderRadius={4} backgroundColor={colores[i]}
                      width={`${Math.max(pct, monto > 0 ? 2 : 0)}%`} />
                  </View>
                </YStack>
              )
            })}
          </YStack>

          {/* Quiénes deben. Solo los primeros: el listado completo es del web. */}
          {datos.Clientes.length > 0 && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
              <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">
                Los que más deben
              </Text>
              {datos.Clientes.slice(0, 10).map((c, i) => (
                <YStack key={c.CodigoCliente} gap="$1"
                  borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border"
                  paddingTop={i === 0 ? 0 : '$2.5'}>
                  <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                    <Text fontSize="$3" color="$text" flex={1} numberOfLines={2}>{c.Cliente}</Text>
                    <Text fontSize="$3" fontWeight="800" color="$text">{dinero(c.Vencido)}</Text>
                  </XStack>
                  <XStack alignItems="center" gap="$2">
                    {/* La etiqueta dice el tramo: el color solo acompaña, nunca
                        carga el significado solo. */}
                    <View backgroundColor={c.Categoria > 0 ? colores[c.Categoria - 1] : 'rgba(148,163,184,0.3)'}
                      borderRadius="$10" paddingHorizontal="$2" paddingVertical={1}>
                      <Text fontSize={10} fontWeight="800" color={c.Categoria >= 3 ? '#fff' : '#3b1010'}>
                        {CATEGORIA[c.Categoria]}
                      </Text>
                    </View>
                    <Text fontSize="$1" color="$textMuted">
                      {c.DiasMax} días · {c.Empresa}
                    </Text>
                  </XStack>
                </YStack>
              ))}
            </YStack>
          )}

          <Text fontSize="$1" color="$textMuted" textAlign="center">
            Montos en dólares, al tipo de cambio del corte. El detalle por asesor y la
            tendencia están en el sistema web.
          </Text>
        </>
      )}
    </ScrollView>
  )
}

function Mini({ titulo, valor, pie, color }: {
  titulo: string; valor: string; pie: string; color?: string
}) {
  return (
    <YStack flex={1} backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
      borderColor="$border" padding="$3" gap="$1" {...shadows.sm}>
      <Text fontSize={10} fontWeight="800" color="$textMuted" textTransform="uppercase">{titulo}</Text>
      <Text fontSize="$7" fontWeight="800" color={color ?? '$text'}>{valor}</Text>
      <Text fontSize="$1" color="$textMuted">{pie}</Text>
    </YStack>
  )
}
