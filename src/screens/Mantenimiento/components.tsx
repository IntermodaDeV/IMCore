import React, { useState } from 'react'
import { ScrollView } from 'react-native'
import { Card, Text, XStack, YStack, View } from 'tamagui'
import { ChevronRight, Settings2 } from 'lucide-react-native'
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
}

export function KpiCard({ titulo, valor, badge }: KpiCardProps) {
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
      <Text fontSize={11} fontWeight="600" color="$textMuted" numberOfLines={1}>
        {titulo}
      </Text>
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Text fontSize={22} fontWeight="800" color="$text">
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
    </Card>
  )
}

// ── Tarjeta de sección (título + contenido) ──────────────────────────────────
interface SectionCardProps {
  titulo: string
  ejeX?: string
  children: React.ReactNode
}

export function SectionCard({ titulo, ejeX, children }: SectionCardProps) {
  return (
    <Card
      {...shadows.sm}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$3"
    >
      <Text fontSize={16} fontWeight="800" color="$text">
        {titulo}
      </Text>
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
}

export function HBarList({ datos, escala, vacioMsg = 'Sin datos' }: HBarListProps) {
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
              {d.value}
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
