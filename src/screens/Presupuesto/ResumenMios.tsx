import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { shadows } from '../../theme/shadows'
import { exigir, mensajeDeError, presupuestoService as api } from '../../api/modules/presupuesto/presupuesto.service'
import { IResumenConsolidado } from '../../api/modules/presupuesto/presupuesto.types'
import { ACCENT, ERR, lps } from './comun'

// Resumen de todos los centros del revisor (todo IT, p. ej.), como el «Resumen por semana» de Mis centros en el web.
// Por centro o por cuenta, con el total del año; al tocar una fila se ven sus semanas (por centro, con la gente
// presupuestada de cada semana) y, si es un centro, sus cuentas. Con una API que no manda semanas: los 13 períodos.

const PERIODOS = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13'] as const

/** Un arreglo JSON de números («[1.5, 0, …]»); vacío si no viene o no se entiende. */
const arreglo = (j: string | null | undefined): number[] => {
  if (!j) return []
  try {
    const a: unknown = JSON.parse(j)
    return Array.isArray(a) ? a.map(x => Number(x) || 0) : []
  } catch {
    return []
  }
}

interface Linea {
  id: string
  titulo: string
  detalle: string
  total: number
  /** Las semanas del año (o los 13 períodos con una API vieja). */
  columnas: number[]
  /** Personas de cada semana: solo por centro (son las mismas en todas sus cuentas). */
  personas: number[] | null
  cuentas: { id: string; titulo: string; total: number }[]
}

function agrupar(datos: IResumenConsolidado[], porCentro: boolean, porSemana: boolean): Linea[] {
  const m = new Map<string, Linea>()
  for (const r of datos) {
    const id = porCentro ? `${r.CentroCosto}|${r.GrupoCodigo}` : String(r.Cuenta)
    let l = m.get(id)
    if (!l) {
      l = porCentro
        ? { id, titulo: `${r.CentroCosto} · ${r.CentroCostoNombre ?? ''}`, detalle: `${r.GrupoCodigo} ${r.GrupoNombre ?? ''}`, total: 0, columnas: [], personas: porSemana ? arreglo(r.Personas) : null, cuentas: [] }
        : { id, titulo: `${r.Cuenta} · ${r.NombreCuenta ?? ''}`, detalle: `${r.GrupoCodigo} ${r.GrupoNombre ?? ''}`, total: 0, columnas: [], personas: null, cuentas: [] }
      m.set(id, l)
    }
    const valores = porSemana ? arreglo(r.Semanas) : PERIODOS.map(p => r[p])
    valores.forEach((v, i) => { (l as Linea).columnas[i] = ((l as Linea).columnas[i] ?? 0) + v })
    l.total += r.Total
    if (porCentro) l.cuentas.push({ id: String(r.Cuenta), titulo: `${r.Cuenta} · ${r.NombreCuenta ?? ''}`, total: r.Total })
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}

export default function ResumenMios({ corridaId, compacto }: { corridaId: number; compacto: boolean }) {
  const [datos, setDatos] = useState<IResumenConsolidado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [porCentro, setPorCentro] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setDatos((await exigir(api.resumenConsolidado(corridaId))).Data ?? [])
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setRefrescando(false)
    }
  }, [corridaId])
  useEffect(() => { void cargar() }, [cargar])

  const porSemana = (datos ?? []).some(r => !!r.Semanas)
  const lineas = useMemo(() => agrupar(datos ?? [], porCentro, porSemana), [datos, porCentro, porSemana])
  const total = lineas.reduce((s, l) => s + l.total, 0)
  const centros = new Set((datos ?? []).map(r => `${r.CentroCosto}|${r.GrupoCodigo}`)).size

  if (!datos && !error) return <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>

  const renderLinea = ({ item: l }: { item: Linea }) => {
    const abiertoEste = abierto === l.id
    return (
      <View backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border" padding={compacto ? '$2.5' : '$3'}
        marginBottom="$2" {...shadows.sm} pressStyle={{ opacity: 0.85 }} onPress={() => setAbierto(abiertoEste ? null : l.id)}>
        <XStack alignItems="center" gap="$2">
          <YStack flex={1} gap={2}>
            <Text fontSize="$3" fontWeight="800" color="$text" numberOfLines={1}>{l.titulo}</Text>
            <Text fontSize="$1" color="$textMuted" numberOfLines={1}>{l.detalle}</Text>
          </YStack>
          <Text fontSize="$3" fontWeight="900" color="$text">{lps(l.total)}</Text>
          {abiertoEste ? <ChevronDown size={18} color="#9ca3af" /> : <ChevronRight size={18} color="#9ca3af" />}
        </XStack>
        {abiertoEste && (
          <YStack gap="$2" marginTop="$2">
            {l.personas && l.personas.length > 0 && <Text fontSize="$1" color="$textMuted">Por semana · p. = personas presupuestadas</Text>}
            <XStack flexWrap="wrap" rowGap="$1.5">
              {l.columnas.map((v, i) => (
                <YStack key={i} width={porSemana ? '25%' : '33.33%'} paddingRight="$2">
                  <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                    {porSemana ? 'S' : 'Per '}{String(i + 1).padStart(2, '0')}
                    {l.personas?.[i] != null ? ` · ${l.personas[i].toLocaleString('es-HN')} p.` : ''}
                  </Text>
                  <Text fontSize="$2" fontWeight="700" color={v ? '$text' : '$textMuted'}>{lps(v)}</Text>
                </YStack>
              ))}
            </XStack>
            {l.cuentas.length > 0 && (
              <YStack gap={4} borderTopWidth={1} borderColor="$border" paddingTop="$2">
                {l.cuentas.map(c => (
                  <XStack key={c.id} justifyContent="space-between" gap="$2">
                    <Text flex={1} fontSize="$2" color="$text" numberOfLines={1}>{c.titulo}</Text>
                    <Text fontSize="$2" color="$text">{lps(c.total)}</Text>
                  </XStack>
                ))}
              </YStack>
            )}
          </YStack>
        )}
      </View>
    )
  }

  return (
    <FlatList
      data={lineas}
      keyExtractor={l => l.id}
      renderItem={renderLinea}
      contentContainerStyle={{ paddingHorizontal: compacto ? 10 : 16, paddingBottom: 40, width: '100%', maxWidth: 1000, alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar() }} colors={[ACCENT]} tintColor={ACCENT} />}
      ListHeaderComponent={
        <YStack gap="$2" marginBottom="$2">
          {!!error && <Text fontSize="$2" color={ERR}>{error}</Text>}
          <XStack justifyContent="space-between" alignItems="baseline">
            <Text fontSize="$2" color="$textMuted">{centros} {centros === 1 ? 'centro' : 'centros'} · total del año</Text>
            <Text fontSize="$5" fontWeight="900" color="$text">L {lps(total)}</Text>
          </XStack>
          <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" backgroundColor="$backgroundElevated" gap="$1">
            {([[true, 'Por centro'], [false, 'Por cuenta']] as const).map(([v, t]) => (
              <View key={t} flex={1} onPress={() => { setPorCentro(v); setAbierto(null) }} pressStyle={{ opacity: 0.85 }}
                backgroundColor={porCentro === v ? ACCENT : 'transparent'} borderRadius="$3" height={compacto ? 30 : 34}
                alignItems="center" justifyContent="center">
                <Text fontWeight="800" fontSize="$1" color={porCentro === v ? '#fff' : '$textMuted'}>{t}</Text>
              </View>
            ))}
          </XStack>
        </YStack>
      }
      ListEmptyComponent={<Text color="$textMuted" textAlign="center" paddingTop="$6">Tus centros todavía no tienen montos.</Text>}
    />
  )
}
