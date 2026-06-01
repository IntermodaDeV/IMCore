import React, { useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { EllipsisVertical, Plus, RotateCw, Trash2, Shield, Pencil, ShieldCheck, KeyRound, } from 'lucide-react-native'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme, Popover, Button } from 'tamagui'
import { securityService } from '../../api/modules/security/security.service'
import { UsersDTO } from '../../api/modules/security/security.types'
import Page from '../../components/commons/Page'
import { useAuth } from '../../context/AuthContext'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../api/modules/response.type'

export default function UsersScreen() {
  const navigation = useNavigation()
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  const [data, setData] = useState<UsersDTO[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      const response: ExecutionResponse<UsersDTO[]> = await securityService.getUsers()
      console.log(response?.Data);
      if(response.Success){
        setData(response?.Data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getInfo()
  }, [])

  const headerActions = React.useMemo(() => [
    {
      icon: RotateCw,
      onPress: getInfo,
    },
    {
      icon: Plus,
      onPress: () => {},
    },
  ], [getInfo])

  return (
    <Page headerActions={headerActions}>
      <YStack
        flex={1}
        backgroundColor="$card2"
        padding="$3"
      >
        {loading ? (
          <SkeletonList/>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            marginBottom="$3"
          >
            {data.map((item) => {
              const initials = `${item.Name?.charAt(0) ?? ''}${item.LastName?.charAt(0) ?? ''}`.toUpperCase()
              const roles = item.Roles ? item.Roles.split(',').map(r => r.trim()) : []
              const visibleRoles = roles.slice(0, 4)
              const remainingRoles = roles.length - 4

              return (
                <Card
                  key={item.Id}
                  backgroundColor="$backgroundPage"
                  borderRadius={10}
                  padding="$3"
                  marginBottom="$2"
                >
                  <YStack gap="$2">
                    <XStack
                      justifyContent="space-between"
                      alignItems="flex-start"
                    >
                      <XStack gap="$3" flex={1}>
                        {/* Avatar */}
                        <View
                          width={50}
                          height={50}
                          borderRadius={25}
                          borderWidth={2.5}
                          borderColor="$primary"
                          justifyContent="center"
                          alignItems="center"
                          padding={2}
                        >
                          <View
                            width={42}
                            height={42}
                            borderRadius={21}
                            backgroundColor="$gray"
                            justifyContent="center"
                            alignItems="center"
                          >
                            <Text
                              color="white"
                              fontSize={16}
                              fontWeight="700"
                            >
                              {initials}
                            </Text>
                          </View>
                        </View>

                        {/* Información */}
                        <YStack flex={1}>
                          <Text
                            fontSize={14}
                            fontWeight="800"
                            color="$text"
                          >
                            {item.Name} {item.LastName}
                          </Text>

                          <Text
                            fontSize={11}
                            color="$text"
                          >
                            {item.Code}
                          </Text>

                          <Text
                            fontSize={10}
                            color="$text"
                            marginTop="$1"
                          >
                            Fecha creación:{' '}
                            {new Date(item.Creation_Date).toLocaleDateString()}
                          </Text>
                        </YStack>
                      </XStack>

                      {/* Acciones */}
                      <XStack
                        alignItems="center"
                        gap="$2"
                      >
                        <View
                          paddingHorizontal={8}
                          paddingVertical={2}
                          borderRadius={999}
                          backgroundColor={
                            item.Status_Id === '1'
                              ? '#22c55e'
                              : '#ef4444'
                          }
                        >
                          <Text
                            fontSize={10}
                            color="white"
                            fontWeight="700"
                          >
                            {item.Status_Id === '1' ? 'Activo' : 'Inactivo'}
                          </Text>
                        </View>

                        <Popover size="$5" placement="bottom-end"  offset={-20}>
                          <Popover.Trigger asChild>
                            <View
                              padding={2}
                              borderRadius={999}
                              pressStyle={{ opacity: 0.7 }}
                            >
                              <EllipsisVertical
                                size={18}
                                color={theme.button?.val}
                              />
                            </View>
                          </Popover.Trigger>

                        <Popover.Content
                          borderWidth={1}
                          backgroundColor="$background"
                          borderRadius="$4"
                          padding="$1"
                          minWidth={100}
                        >
                          <YStack gap="$1">
                            <Button
                              chromeless
                              justifyContent="flex-start"
                              icon={<Pencil size={14} color={theme.text?.val} />}
                              onPress={() => {}}
                              color={theme.button?.val}
                              fontSize={12}
                            >
                              Editar
                            </Button>

                            <Button
                              chromeless
                              justifyContent="flex-start"
                              icon={<KeyRound size={14} color={theme.text?.val} />}
                              onPress={() => {}}
                              color={theme.button?.val}
                              fontSize={12}
                            >
                              Accesos
                            </Button>

                            <Button
                              chromeless
                              justifyContent="flex-start"
                              icon={<ShieldCheck size={14} color={theme.text?.val} />}
                              onPress={() => {}}
                              color={theme.button?.val}
                              fontSize={12}
                            >
                              Permisos
                            </Button>
                          </YStack>
                        </Popover.Content>
                        </Popover>
                      </XStack>
                    </XStack>


                    <YStack gap="$4">
                      {roles.length > 0 && (
                        <XStack
                          flexWrap="wrap"
                          gap="$1"
                          paddingTop="$1"
                        >
                          {visibleRoles.map((role, index) => (
                            <View
                              key={`${role}-${index}`}
                              backgroundColor="$buttonCancel"
                              paddingHorizontal={8}
                              paddingVertical={3}
                              borderRadius={999}
                            >
                              <Text
                                fontSize={10}
                                fontWeight="600"
                              >
                                {role}
                              </Text>
                            </View>
                          ))}

                          {remainingRoles > 0 && (
                            <View
                              backgroundColor="$buttonCancel"
                              paddingHorizontal={8}
                              paddingVertical={3}
                              borderRadius={999}
                            >
                              <Text
                                fontSize={10}
                                fontWeight="600"
                              >
                                +{remainingRoles}
                              </Text>
                            </View>
                          )}
                        </XStack>
                      )}
                    </YStack>
                  </YStack>
                </Card>
              )
            })}
          </ScrollView>
        )}
      </YStack>
    </Page>
  )
}