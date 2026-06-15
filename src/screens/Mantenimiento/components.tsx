import React from 'react'
import { ScrollView } from 'react-native'
import { Card, Text, XStack, YStack, View } from 'tamagui'
import { ACCENT, Conteo } from './mantenimiento.helpers'

// ── Tarjeta KPI ──────────────────────────────────────────────────────────────
interface KpiCardProps {
  titulo: string
  valor: string
  sub?: string
  subColor?: string
}

export function KpiCard({ titulo, valor, sub, subColor }: KpiCardProps) {
  return (
    <Card
      flex={1}
      minWidth="30%"
      backgroundColor="$card2"
      borderWidth={1}
      borderColor="$border"
      borderRadius="$4"
      padding="$3"
      gap="$1"
    >
      <Text fontSize={10} fontWeight="700" color="$foregroundMuted" numberOfLines={1}>
        {titulo.toUpperCase()}
      </Text>
      <Text fontSize={22} fontWeight="800" color="$text">
        {valor}
      </Text>
      {!!sub && (
        <Text fontSize={11} fontWeight="600" color={subColor ?? '$foregroundMuted'}>
          {sub}
        </Text>
      )}
    </Card>
  )
}

// ── Tarjeta de sección (título + contenido), reemplaza st.subheader + chart ──
interface SectionCardProps {
  titulo: string
  children: React.ReactNode
}

export function SectionCard({ titulo, children }: SectionCardProps) {
  return (
    <Card
      backgroundColor="$card2"
      borderWidth={1}
      borderColor="$border"
      borderRadius="$4"
      padding="$3"
      gap="$3"
    >
      <Text fontSize={15} fontWeight="700" color="$text">
        {titulo}
      </Text>
      {children}
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
            <Text
              fontSize={14}
              fontWeight="700"
              color={sel ? ACCENT : '$foregroundMuted'}
            >
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

// ── Lista de barras horizontales (Área, Tipo de Paro, Rankings) ──────────────
// Robusta y fiel al look de Streamlit: barra proporcional + valor al final.
interface HBarListProps {
  datos: Conteo[]
  color?: string
  vacioMsg?: string
}

export function HBarList({ datos, color = ACCENT, vacioMsg = 'Sin datos' }: HBarListProps) {
  if (!datos.length) {
    return (
      <Text fontSize={12} color="$foregroundMuted">
        {vacioMsg}
      </Text>
    )
  }
  const max = Math.max(...datos.map(d => d.value), 1)
  // Mostrar mayor arriba en rankings: invertimos el orden ascendente que llega.
  const ordenado = [...datos].sort((a, b) => b.value - a.value)
  return (
    <YStack gap="$2">
      {ordenado.map(d => (
        <YStack key={d.label} gap={2}>
          <XStack justifyContent="space-between">
            <Text fontSize={12} color="$text" numberOfLines={1} flex={1} marginRight="$2">
              {d.label}
            </Text>
            <Text fontSize={12} fontWeight="700" color="$text">
              {d.value}
            </Text>
          </XStack>
          <View height={8} borderRadius={999} backgroundColor="$backgroundHover">
            <View
              height={8}
              borderRadius={999}
              backgroundColor={color}
              width={`${(d.value / max) * 100}%`}
            />
          </View>
        </YStack>
      ))}
    </YStack>
  )
}
