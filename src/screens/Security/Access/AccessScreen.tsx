import React, { useEffect, useMemo, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Plus, RotateCw, User } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, XStack, View, styled } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { AccessDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import SearchInput from '../../../components/commons/SearchInput'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { AppError, handleError } from '../../../utils/errorHandler'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { usePageHeader } from '../../../hooks/usePageHeader'

export type RootStackParamList = {
  home: undefined;
  access_form: { Id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function AccessScreen() {
  const navigation = useNavigation<NavProps>();
  const theme = useTheme()
  const RotateCwStyled = styled(RotateCw, { color: '$text' });
  const PlusStyled = styled(Plus, { color: '$text' });


  const [loading, setLoading] = useState(false)
  const [filtered, setFiltered] = useState<AccessDTO[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<AccessDTO | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const [data, setData] = useState<AccessDTO[]>([])
  // Por defecto las categorías inician colapsadas; solo se abren al tocarlas.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Agrupa los accesos por categoría; los sin categoría caen en 'Otros' (al final).
  const OTROS = 'Otros'
  const grupos = useMemo(() => {
    const map = new Map<string, AccessDTO[]>()
    for (const a of filtered ?? []) {
      const cat = (a.Category && a.Category.trim()) ? a.Category.trim() : OTROS
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(a)
    }
    // Dentro de cada categoría manda el `Orden` declarado, y después el nombre.
    // Sin esto salían en orden de Id, o sea en el orden en que se fueron
    // creando: los seis permisos de pases aparecían mezclados y el de jefe
    // —que es el primer paso del flujo— último, porque se creó al final.
    for (const items of map.values())
      items.sort((x, y) =>
        (x.Orden ?? 9999) - (y.Orden ?? 9999) || (x.Name ?? '').localeCompare(y.Name ?? ''))

    return [...map.entries()].sort(([a], [b]) => {
      if (a === OTROS) return 1
      if (b === OTROS) return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  const toggleCat = (cat: string) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<AccessDTO[]> = await securityService.getAccess()
      if (response.Success) {
        setData(response.Data)
        setFiltered(response.Data)
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const createAccess = (Id?: number) => {
    navigation.navigate('access_form', { Id })
  }

  const toggleStatus = async () => {
    if (!selectedItem) return

    try {
      const newStatus = selectedItem.Status_Id === 1 ? 2 : 1

      let Data: AccessDTO = {
        ...selectedItem,
        Status_Id: newStatus,
        Modified_By: user?.Code as string,
      }
      const response: ExecutionResponse<AccessDTO[]> = await securityService.changeStatusAccess([Data])
      if (response.Success) {
        setData(prev =>
          prev.map(item =>
            item.Id === selectedItem.Id
              ? {
                  ...item,
                  Status_Id: newStatus,
                  Status_Name: newStatus === 1 ? 'Activo' : 'Inactivo',
                }
              : item
          )
        )
        showToast('success', 'Éxito', response.SuccessMessage || 'Estado actualizado correctamente', 5000, 'bottom')
      }
    } finally {
      setDialogOpen(false)
    }
  }

  usePageHeader({
      center: (
      <Text fontSize={16} fontWeight="700" color="$text">
          Accesos
      </Text>
      ),
   
      right: (
        <XStack gap="$2">
          <View onPress={() => getInfo()}>
            <RotateCwStyled size={18} />
          </View>

          <View onPress={() => createAccess()}>
            <PlusStyled size={18} />
          </View>
        </XStack>
      )
  })

  useEffect(() => {
    getInfo()
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  useEffect(() => {
    setFiltered(data)
  }, [data])



  return (
    <Page >
      <YStack
        flex={1}
        backgroundColor="$backgroundPage"
        padding="$3"
      >
        {loading ? (
          <>
            <SkeletonList/>
          </>
        ) : error ? (
          <ErrorState
            type="server"
            title={error.title}
            message={error.message}
            errorCode={error.status}
            onRetry={getInfo}
          />
        ) : 
        (
          <>
            <SearchInput
              data={data}
              searchKeys={['Name', 'KeyVar', 'Description']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />
            <ScrollView
              showsVerticalScrollIndicator={false}
              marginBottom="$3"
            >

              {(filtered?.length ?? 0) === 0 ? (
                  <EmptyState onAction={() => getInfo()} />
                ) : (
                  grupos.map(([cat, items]) => {
                    const abierto = !!expanded[cat]
                    return (
                      <YStack key={cat} gap="$3" marginBottom="$2">
                        {/* Encabezado de categoría (colapsable) — mismo estándar que Permisos */}
                        <XStack
                          alignItems="center"
                          gap="$2"
                          paddingVertical="$2"
                          paddingHorizontal="$1"
                          marginTop="$1"
                          pressStyle={{ opacity: 0.7 }}
                          onPress={() => toggleCat(cat)}
                        >
                          {abierto
                            ? <ChevronDown size={18} color="#94A3B8" />
                            : <ChevronRight size={18} color="#94A3B8" />}
                          <Text fontWeight="800" fontSize={13} color="$textMuted" textTransform="uppercase" letterSpacing={0.5}>
                            {cat}
                          </Text>
                          <Text fontSize={12} color="$textMuted">· {items.length}</Text>
                        </XStack>

                        {abierto && items.map((item) => {
                          const isActive = item.Status_Id === 1
                          return (
                            <XStack
                              key={item.Id}
                              backgroundColor="$backgroundElevated"
                              borderRadius="$4"
                              paddingVertical="$3"
                              paddingHorizontal="$4"
                              alignItems="center"
                              borderWidth={0}
                              overflow="hidden"
                              gap="$3"
                              shadowColor="#000"
                              shadowOffset={{ width: 0, height: 2 }}
                              shadowOpacity={0.07}
                              shadowRadius={6}
                              elevation={2}
                              onPress={() => { setSelectedItem(item); setDialogOpen(true) }}
                              pressStyle={{ opacity: 0.75, scale: 0.99 }}
                            >
                              {/* Franja izquierda */}
                              <View position="absolute" left={0} top={0} bottom={0} width={4}
                                backgroundColor={isActive ? '$primary' : 'transparent'} />

                              {/* Ícono circular */}
                              <View width={40} height={40} borderRadius={20}
                                backgroundColor={isActive ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
                                justifyContent="center" alignItems="center">
                                <User size={20} color={isActive ? '#FF551A' : '#94A3B8'} />
                              </View>

                              {/* Info */}
                              <YStack flex={1} gap="$0.5">
                                <Text fontWeight="700" fontSize={14} color="$text">{item.Name}</Text>
                                <Text fontSize={12} color="$textMuted">{item.KeyVar} - {item.Description || 'Sin descripción'}</Text>
                              </YStack>

                              {/* Badge de estado + editar */}
                              <XStack alignItems="center" gap="$2">
                                <View
                                  backgroundColor={isActive ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148, 163, 184, 0.15)'}
                                  paddingHorizontal="$2" paddingVertical={3} borderRadius="$10"
                                >
                                  <Text fontSize={10} color={isActive ? '$primary' : '$textMuted'} fontWeight="700">
                                    {isActive ? 'Activo' : 'Inactivo'}
                                  </Text>
                                </View>
                                <View
                                  onPress={(e: any) => { e?.stopPropagation?.(); createAccess(item.Id) }}
                                  pressStyle={{ opacity: 0.6 }}
                                  padding="$2"
                                  hitSlop={8}
                                >
                                  <Pencil size={16} color={theme.primary?.val} />
                                </View>
                              </XStack>
                            </XStack>
                          )
                        })}
                      </YStack>
                    )
                  })
              )}
            </ScrollView>
          </>
        )}
      </YStack>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={selectedItem?.Status_Name === 'Activo' ? 'Desactivar acceso' : 'Activar acceso'}
        message={ selectedItem?.Status_Name === 'Activo'
                ? `¿Deseas desactivar el acceso "${selectedItem?.Name}"? Los usuarios con este acceso asignado no podrán utilizarlo.`
                : `¿Deseas activar el acceso "${selectedItem?.Name}"?`
        }
        confirmLabel={selectedItem?.Status_Name === 'Activo' ? 'Desactivar' : 'Activar'}
        confirmColor={selectedItem?.Status_Name === 'Activo' ? '#ef4444' : '#22c55e'}
        onConfirm={toggleStatus}
      />
    </Page>
  )
}
