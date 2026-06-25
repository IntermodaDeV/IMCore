import React, { useEffect } from 'react'
import { FlatList, RefreshControl, Pressable } from 'react-native'
import { YStack, XStack, Text, View, Spinner, useTheme } from 'tamagui'
import { BellOff, CheckCheck } from 'lucide-react-native'
import { useNotifications } from '../../context/NotificationsContext'
import { useRightDrawer } from '../../providers/RightDrawerProvider'
import { getCategoryMeta } from '../../config/notificationCategories'
import { INotification } from '../../api/modules/notifications/notifications.service'
import { routeNotification } from '../../services/notificationRouter'

// Tiempo relativo legible ("hace 5 min", "hace 2 h", "ayer", fecha).
function timeAgo(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function parseData(raw?: string | null): any {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export default function NotificationsInbox() {
  const theme = useTheme()
  const { closeDrawer } = useRightDrawer()
  const { items, loading, refreshing, refresh, markRead, markAllRead, unreadCount } =
    useNotifications()

  useEffect(() => {
    refresh()
  }, [])

  const onPressItem = (n: INotification) => {
    if (!n.IsRead) markRead(n.Id)

    // Enruta por categoría (mismo router que usa el tap de push).
    // Cierra primero el drawer (es un Modal) y luego navega.
    const data = { ...parseData(n.Data), category: n.Category }
    closeDrawer()
    setTimeout(() => routeNotification(data), 350)
  }

  const renderItem = ({ item }: { item: INotification }) => {
    const meta = getCategoryMeta(item.Category)
    const Icon = meta.Icon
    return (
      <Pressable onPress={() => onPressItem(item)}>
        {({ pressed }) => (
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            gap="$3"
            alignItems="flex-start"
            backgroundColor={
              !item.IsRead ? 'rgba(255,85,26,0.06)' : pressed ? '$backgroundHover' : 'transparent'
            }
            borderBottomWidth={1}
            borderBottomColor="$border"
            opacity={pressed ? 0.85 : 1}
          >
            {/* Icono de categoría */}
            <View
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor={meta.bg}
              alignItems="center"
              justifyContent="center"
            >
              <Icon size={20} color={meta.color} />
            </View>

            {/* Contenido */}
            <YStack flex={1} gap={2}>
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <Text fontSize={11} fontWeight="700" color={meta.color} textTransform="uppercase">
                  {meta.label}
                </Text>
                <Text fontSize={11} color="$textMuted">
                  {timeAgo(item.Creation_Date)}
                </Text>
              </XStack>
              <Text
                fontSize={14}
                fontWeight={item.IsRead ? '600' : '800'}
                color="$text"
                numberOfLines={1}
              >
                {item.Title}
              </Text>
              {!!item.Body && (
                <Text fontSize={13} color="$textMuted" numberOfLines={2}>
                  {item.Body}
                </Text>
              )}
            </YStack>

            {/* Punto de no leída */}
            {!item.IsRead && (
              <View width={9} height={9} borderRadius={5} backgroundColor="#FF551A" marginTop={6} />
            )}
          </XStack>
        )}
      </Pressable>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$backgroundElevated">
      {/* Acción "marcar todas" */}
      {unreadCount > 0 && (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          justifyContent="flex-end"
          borderBottomWidth={1}
          borderBottomColor="$border"
        >
          <Pressable onPress={markAllRead} hitSlop={8}>
            <XStack alignItems="center" gap="$1.5">
              <CheckCheck size={15} color={theme.primary?.val as string} />
              <Text fontSize={12} fontWeight="700" color="$primary">
                Marcar todas como leídas
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      )}

      {loading && items.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color="$primary" />
        </YStack>
      ) : items.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$6">
          <BellOff size={42} color={theme.textMuted?.val as string} />
          <Text fontSize={15} fontWeight="700" color="$text">
            Sin notificaciones
          </Text>
          <Text fontSize={13} color="$textMuted" textAlign="center">
            Aquí verás las entradas y salidas de tus pases y otras alertas.
          </Text>
        </YStack>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.Id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh(true)}
              tintColor={theme.primary?.val as string}
            />
          }
        />
      )}
    </YStack>
  )
}
