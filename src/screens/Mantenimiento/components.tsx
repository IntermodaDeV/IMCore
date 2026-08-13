import React, { useState } from 'react'
import { ScrollView } from 'react-native'
import { Card, Text, XStack, YStack, View } from 'tamagui'
import { ChevronRight, HelpCircle, Settings2, TrendingDown, TrendingUp } from 'lucide-react-native'
import { ACCENT, Conteo, Escala, shade } from './mantenimiento.helpers'
import { shadows } from '../../theme/shadows'

// ── Tarjeta KPI (con badge tipo "delta" de Streamlit) ────────────────────────
interface KpiBadge {
  text: string
  color: string
  up?: boolean
}
interface KpiCardProps {
  titulo: string
  valor: string
  badge?: KpiBadge
  // Línea de apoyo debajo del número (mediana, conteo, unidad…).
  hint?: string
  // Variación % contra el período anterior. `invertido` = bajar es bueno.
  delta?: number | null
  invertido?: boolean
  // Color del número (los tramos del paro se pintan con su color).
  color?: string
  // Tamaño del valor. Se baja cuando el "valor" es un texto largo (un motivo,
  // un nombre) y no un número.
  valorTamano?: number
  // Qué es este número, en lenguaje llano. Va detrás de un "?" que se despliega
  // al tocarlo: quien ya lo sabe no lo ve, quien no, lo tiene a mano.
  info?: string
}

const VERDE_OK = '#22c55e'
const ROJO_MAL = '#ef4444'

export function KpiCard({
  titulo,
  valor,
  badge,
  hint,
  delta,
  invertido,
  color,
  valorTamano = 22,
  info,
}: KpiCardProps) {
  const [ayuda, setAyuda] = useState(false)
  const sube = (delta ?? 0) > 0
  const bueno = invertido ? !sube : sube
  // Movimientos por debajo de medio punto son ruido: se pintan en gris.
  const colorDelta = delta == null || Math.abs(delta) < 0.5 ? '#94A3B8' : bueno ? VERDE_OK : ROJO_MAL
  const IconoDelta = sube ? TrendingUp : TrendingDown

  return (
    <Card
      flex={1}
      minWidth="44%"
      {...shadows.sm}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      gap="$1"
    >
      <XStack alignItems="center" gap="$1.5">
        <Text fontSize={11} fontWeight="600" color="$textMuted" numberOfLines={1} flexShrink={1}>
          {titulo}
        </Text>
        {!!info && (
          <View onPress={() => setAyuda(v => !v)} hitSlop={10} pressStyle={{ opacity: 0.5 }}>
            <HelpCircle size={12} color={ayuda ? ACCENT : '#94A3B8'} />
          </View>
        )}
      </XStack>
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Text
          fontSize={valorTamano}
          fontWeight="800"
          color={color ?? '$text'}
          numberOfLines={3}
          flexShrink={1}
        >
          {valor}
        </Text>
        {!!badge && (
          <XStack
            alignItems="center"
            backgroundColor={badge.color + '22'}
            paddingHorizontal={7}
            paddingVertical={2}
            borderRadius={7}
          >
            <Text fontSize={10} color={badge.color} fontWeight="800">
              {badge.text}
            </Text>
          </XStack>
        )}
      </XStack>
      {(delta != null || !!hint) && (
        <XStack alignItems="center" gap={4} flexWrap="wrap">
          {delta != null && (
            <>
              <IconoDelta size={12} color={colorDelta} />
              <Text fontSize={11} fontWeight="800" color={colorDelta}>
                {`${sube ? '+' : ''}${delta.toFixed(0)}%`}
              </Text>
            </>
          )}
          <Text fontSize={11} color="$textMuted" flexShrink={1}>
            {delta != null ? 'vs. período anterior' : hint}
          </Text>
        </XStack>
      )}
      {ayuda && !!info && (
        <Text fontSize={11} color="$textMuted" lineHeight={16}>
          {info}
        </Text>
      )}
    </Card>
  )
}

// ── Barra apilada (los tramos del paro: espera / trabajo / pausa) ────────────
export interface Tramo {
  label: string
  pct: number
  color: string
}

export function BarraApilada({ tramos, altura = 32 }: { tramos: Tramo[]; altura?: number }) {
  const visibles = tramos.filter(t => t.pct > 0)
  if (!visibles.length) return null
  return (
    <XStack height={altura} borderRadius="$3" overflow="hidden">
      {visibles.map(t => (
        <XStack
          key={t.label}
          flex={Math.max(t.pct, 0.01)}
          backgroundColor={t.color}
          alignItems="center"
          justifyContent="center"
        >
          {/* Con tramos angostos el texto no cabe: se deja solo el color. */}
          {t.pct >= 12 && (
            <Text fontSize={12} fontWeight="800" color="#fff" numberOfLines={1}>
              {t.label}
            </Text>
          )}
        </XStack>
      ))}
    </XStack>
  )
}

// ── Tarjeta de sección (título + contenido) ──────────────────────────────────
interface SectionCardProps {
  titulo: string
  // Línea de contexto bajo el título: qué mide el bloque, en una frase.
  subtitulo?: string
  ejeX?: string
  children: React.ReactNode
}

export function SectionCard({ titulo, subtitulo, ejeX, children }: SectionCardProps) {
  return (
    <Card
      {...shadows.sm}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$3"
    >
      <YStack gap={2}>
        <Text fontSize={16} fontWeight="800" color="$text">
          {titulo}
        </Text>
        {!!subtitulo && (
          <Text fontSize={11} color="$textMuted" lineHeight={15}>
            {subtitulo}
          </Text>
        )}
      </YStack>
      {children}
      {!!ejeX && (
        <Text fontSize={10} color="$textMuted" alignSelf="center">
          {ejeX}
        </Text>
      )}
    </Card>
  )
}

// ── Barra de tabs (Resumen / Análisis / Rankings / Detalle) ──────────────────
interface TabBarProps {
  tabs: string[]
  activo: number
  onChange: (i: number) => void
}

export function TabBar({ tabs, activo, onChange }: TabBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 24 }}
    >
      {tabs.map((t, i) => {
        const sel = i === activo
        return (
          <YStack key={t} onPress={() => onChange(i)} paddingVertical="$2">
            <Text fontSize={14} fontWeight="700" color={sel ? ACCENT : '$textMuted'}>
              {t}
            </Text>
            <View
              height={3}
              marginTop="$1"
              borderRadius={999}
              backgroundColor={sel ? ACCENT : 'transparent'}
            />
          </YStack>
        )
      })}
    </ScrollView>
  )
}

// ── Cabecera colapsable de filtros (acordeón "⚙️ Filtros ›", como Python móvil) ─
interface FiltrosColapsablesProps {
  resumen: string
  children: React.ReactNode
}

export function FiltrosColapsables({ resumen, children }: FiltrosColapsablesProps) {
  const [abierto, setAbierto] = useState(false)
  return (
    <YStack
      borderWidth={0}
      {...shadows.sm}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      overflow="hidden"
    >
      <XStack
        alignItems="center"
        gap="$2"
        padding="$3"
        pressStyle={{ backgroundColor: '$backgroundPress' }}
        onPress={() => setAbierto(v => !v)}
      >
        <Settings2 size={16} color={ACCENT} />
        <Text fontSize={14} fontWeight="700" color="$text" flex={1}>
          Filtros
        </Text>
        <Text fontSize={11} color="$textMuted" numberOfLines={1} marginRight="$2">
          {resumen}
        </Text>
        <View rotate={abierto ? '90deg' : '0deg'}>
          <ChevronRight size={18} color="#94A3B8" />
        </View>
      </XStack>
      {abierto && (
        <YStack padding="$3" paddingTop={0} gap="$2">
          {children}
        </YStack>
      )}
    </YStack>
  )
}

// ── Lista de barras horizontales con degradado por valor (≈ plotly continuo) ──
interface HBarListProps {
  datos: Conteo[]
  escala: Escala
  vacioMsg?: string
  // Cómo se escribe el valor al final de la fila (por defecto, el número pelado).
  formato?: (v: number) => string
}

export function HBarList({ datos, escala, vacioMsg = 'Sin datos', formato }: HBarListProps) {
  if (!datos.length) {
    return (
      <Text fontSize={12} color="$foregroundMuted">
        {vacioMsg}
      </Text>
    )
  }
  const max = Math.max(...datos.map(d => d.value), 1)
  const ordenado = [...datos].sort((a, b) => b.value - a.value)
  return (
    <YStack gap="$2">
      {ordenado.map(d => (
        <YStack key={d.label} gap={3}>
          <XStack justifyContent="space-between">
            <Text fontSize={12} color="$text" numberOfLines={1} flex={1} marginRight="$2">
              {d.label}
            </Text>
            <Text fontSize={12} fontWeight="700" color="$text">
              {formato ? formato(d.value) : d.value}
            </Text>
          </XStack>
          <View height={9} borderRadius={999} backgroundColor="$backgroundHover">
            <View
              height={9}
              borderRadius={999}
              backgroundColor={shade(escala, d.value / max)}
              width={`${(d.value / max) * 100}%`}
            />
          </View>
        </YStack>
      ))}
    </YStack>
  )
}
