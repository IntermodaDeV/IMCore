import React from 'react'
import { Pressable } from 'react-native'
import { View, Text, styled } from 'tamagui'
import { Bell } from 'lucide-react-native'
import { useRightDrawer } from '../../providers/RightDrawerProvider'
import { useNotifications } from '../../context/NotificationsContext'
import NotificationsInbox from './NotificationsInbox'

const BellStyled = styled(Bell, {
  color: '$text',
})

export function NotificationBell({ size = 20 }: { size?: number }) {
  const { openDrawer } = useRightDrawer()
  const { unreadCount, refresh } = useNotifications()

  const open = () => {
    openDrawer(<NotificationsInbox />, { title: 'Notificaciones' })
    refresh()
  }

  return (
    <Pressable onPress={open} hitSlop={10}>
      <View>
        <BellStyled size={size} />
        {unreadCount > 0 && (
          <View
            position="absolute"
            top={-7}
            right={-8}
            minWidth={16}
            height={16}
            borderRadius={8}
            backgroundColor="#EF4444"
            alignItems="center"
            justifyContent="center"
            paddingHorizontal={3}
            borderWidth={1.5}
            borderColor="$background"
          >
            <Text color="#fff" fontSize={9} fontWeight="800" lineHeight={12}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}
