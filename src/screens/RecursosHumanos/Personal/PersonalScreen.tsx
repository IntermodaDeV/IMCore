import { Users, RotateCw, Camera, Trash2, Image as ImageIcon } from 'lucide-react-native'
import React, { useEffect, useMemo, useState } from 'react'
import { FlatList, Image, PermissionsAndroid, Platform } from 'react-native'
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker'
import { YStack, XStack, Text, View, styled, Spinner, AlertDialog, Button } from 'tamagui'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { ICompany, IEmployee } from '../../../api/modules/recursosHumanos/recursosHumanos.types'
import { AppError, handleError } from '../../../utils/errorHandler'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { recursosHumanosService, employeePhotoUrl } from '../../../api/modules/recursosHumanos/recursosHumanos.service'
import { useShowToast } from '../../../utils/useShowToast'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { useLoader } from '../../../providers/LoaderProvider'
import ErrorState from '../../AdmSys/ErrorState'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import SearchInput from '../../../components/commons/SearchInput'
import AppSelect from '../../../components/commons/AppSelect'
import { useAuth } from '../../../context/AuthContext'
import { useCountrySelector } from '../../../hooks/useCountrySelector'
import EmptyState from '../../AdmSys/EmptyState'
import RecordCount from '../../../components/commons/RecordCount'

const RotateCwStyled = styled(RotateCw, { color: '$text' })

const nombreEmpleado = (e: IEmployee) => {
  const compuesto = [e.Name, e.MiddleName, e.LastName, e.SecondLastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (compuesto) return compuesto

  let nombre = (e.Employee_Name || '').trim()
  if (e.Employee_Code && nombre.startsWith(e.Employee_Code)) {
    nombre = nombre.slice(e.Employee_Code.length)
  }
  nombre = nombre.replace(/^\s*\S*\d\S*\s*-\s*/, '').replace(/^\s*-\s*/, '').trim()

  return nombre || 'Sin nombre'
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <XStack justifyContent="space-between" gap="$2">
      <Text fontSize={12} color="$textMuted">
        {label}
      </Text>
      <Text fontSize={12} color="$text" fontWeight="600" flexShrink={1} textAlign="right">
        {value || '—'}
      </Text>
    </XStack>
  )
}

const COMPRESION_FOTO = {
  mediaType: 'photo',
  quality: 0.6,
  maxWidth: 800,
  maxHeight: 800,
  includeBase64: true,
} as const

const requestCameraPermission = async () => {
  if (Platform.OS !== 'android') return true
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Permiso de cámara',
    message: 'La app necesita acceso a la cámara para tomar la foto del empleado',
    buttonPositive: 'OK',
  })
  return granted === PermissionsAndroid.RESULTS.GRANTED
}

function PhotoSourceDialog({
  open,
  onOpenChange,
  onCamera,
  onGallery,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCamera: () => void
  onGallery: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          key="overlay"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          opacity={0.6}
          backgroundColor="black"
        />
        <AlertDialog.Content
          elevate
          key="content"
          width="85%"
          alignSelf="center"
          enterStyle={{ y: -12, opacity: 0, scale: 0.94 }}
          exitStyle={{ y: 8, opacity: 0, scale: 0.96 }}
          backgroundColor="$backgroundElevated"
          borderRadius="$6"
          paddingHorizontal="$5"
          paddingVertical="$5"
          x={0}
          y={0}
          scale={1}
          opacity={1}
        >
          <YStack gap="$3">
            <AlertDialog.Title>
              <Text fontSize={16} fontWeight="700" color="$text" textAlign="center">
                Foto del empleado
              </Text>
            </AlertDialog.Title>

            <Button
              height={46}
              borderRadius="$4"
              backgroundColor="$primary"
              pressStyle={{ opacity: 0.8 }}
              onPress={() => {
                onOpenChange(false)
                onCamera()
              }}
            >
              <XStack gap="$2" alignItems="center">
                <Camera size={18} color="white" />
                <Text color="white" fontWeight="700" fontSize={14}>
                  Cámara
                </Text>
              </XStack>
            </Button>

            <Button
              height={46}
              borderRadius="$4"
              backgroundColor="$buttonSecondary"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => {
                onOpenChange(false)
                onGallery()
              }}
            >
              <XStack gap="$2" alignItems="center">
                <ImageIcon size={18} color="#94A3B8" />
                <Text color="$text" fontWeight="700" fontSize={14}>
                  Galería
                </Text>
              </XStack>
            </Button>

            <AlertDialog.Cancel asChild>
              <Button
                height={42}
                borderRadius="$4"
                backgroundColor="transparent"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => onOpenChange(false)}
              >
                <Text fontSize={14} fontWeight="600" color="$textMuted">
                  Cancelar
                </Text>
              </Button>
            </AlertDialog.Cancel>
          </YStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  )
}

function PhotoPreviewDialog({
  open,
  onOpenChange,
  uri,
  nombre,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  uri: string
  nombre: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          key="overlay"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          opacity={0.85}
          backgroundColor="black"
          onPress={() => onOpenChange(false)}
        />
        <AlertDialog.Content
          elevate
          key="content"
          width="90%"
          alignSelf="center"
          enterStyle={{ opacity: 0, scale: 0.94 }}
          exitStyle={{ opacity: 0, scale: 0.96 }}
          backgroundColor="$backgroundElevated"
          borderRadius="$6"
          padding="$4"
          scale={1}
          opacity={1}
        >
          <YStack gap="$3">
            <AlertDialog.Title>
              <Text fontSize={15} fontWeight="700" color="$text" textAlign="center" numberOfLines={2}>
                {nombre}
              </Text>
            </AlertDialog.Title>

            <View
              width="100%"
              aspectRatio={1}
              borderRadius="$4"
              overflow="hidden"
              backgroundColor="$backgroundSurface"
              alignItems="center"
              justifyContent="center"
            >
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>

            <AlertDialog.Cancel asChild>
              <Button
                height={42}
                borderRadius="$4"
                backgroundColor="transparent"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => onOpenChange(false)}
              >
                <Text fontSize={14} fontWeight="600" color="$textMuted">
                  Cerrar
                </Text>
              </Button>
            </AlertDialog.Cancel>
          </YStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  )
}

const EmployeeCard = React.memo(function EmployeeCard({ empleado }: { empleado: IEmployee }) {
  const nombre = nombreEmpleado(empleado)
  const { showToast } = useShowToast()
  const { user } = useAuth()
  const [imgError, setImgError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [cacheBust, setCacheBust] = useState(0)

  const baseUrl = employeePhotoUrl(empleado.Employee_Code)
  const fotoUrl = baseUrl ? `${baseUrl}&t=${cacheBust}` : ''
  const mostrarFoto = !!fotoUrl && !imgError

  const subirFoto = async (asset: Asset) => {
    if (!asset?.base64) return
    try {
      setBusy(true)
      const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase()
      const resp = await recursosHumanosService.uploadEmployeePhoto(empleado.Employee_Code, asset.base64, ext, user?.Code)
      if (resp.Success) {
        setImgError(false)
        setCacheBust(Date.now())
        showToast('success', 'Éxito', resp.SuccessMessage || 'Foto actualizada', 4000, 'top')
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo guardar la foto', 4000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'No se pudo guardar la foto', 4000, 'top')
    } finally {
      setBusy(false)
    }
  }

  const elegirGaleria = () => {
    launchImageLibrary({ ...COMPRESION_FOTO, selectionLimit: 1 }, res => {
      if (res.didCancel || res.errorCode) return
      const asset = res.assets?.[0]
      if (asset) subirFoto(asset)
    })
  }

  const tomarFoto = async () => {
    if (!(await requestCameraPermission())) return
    launchCamera({ ...COMPRESION_FOTO, cameraType: 'back' }, res => {
      if (res.didCancel || res.errorCode) return
      const asset = res.assets?.[0]
      if (asset) subirFoto(asset)
    })
  }

  const eliminarFoto = async () => {
    try {
      setBusy(true)
      const resp = await recursosHumanosService.deleteEmployeePhoto(empleado.Employee_Code, user?.Code)
      if (resp.Success) {
        setImgError(true)
        setCacheBust(Date.now())
        showToast('success', 'Éxito', resp.SuccessMessage || 'Foto eliminada', 4000, 'top')
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo eliminar la foto', 4000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'No se pudo eliminar la foto', 4000, 'top')
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$4"
      gap="$2"
      marginBottom="$3"
      overflow="hidden"
      shadowColor="#000"
      shadowOffset={{ width: 0, height: 2 }}
      shadowOpacity={0.07}
      shadowRadius={6}
      elevation={2}
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
        <Text flex={1} fontWeight="700" fontSize={15} color="$text" numberOfLines={2} ellipsizeMode="tail">
          {nombre}
        </Text>

        <XStack gap="$2">
          <View
            onPress={() => setSourceOpen(true)}
            width={34}
            height={34}
            borderRadius={999}
            backgroundColor="$primaryOpacity"
            alignItems="center"
            justifyContent="center"
            pressStyle={{ opacity: 0.6 }}
          >
            <Camera size={16} color="#FF551A" />
          </View>

          <View
            onPress={mostrarFoto ? () => setConfirmOpen(true) : undefined}
            disabled={!mostrarFoto}
            width={34}
            height={34}
            borderRadius={999}
            backgroundColor="$errorOpacity"
            alignItems="center"
            justifyContent="center"
            opacity={mostrarFoto ? 1 : 0.4}
            pressStyle={mostrarFoto ? { opacity: 0.6 } : undefined}
          >
            <Trash2 size={16} color="#EF4444" />
          </View>
        </XStack>
      </XStack>

      <XStack gap="$3" marginTop="$1" alignItems="center">
        <View
          width="35%"
          aspectRatio={1}
          borderRadius="$3"
          overflow="hidden"
          backgroundColor="$backgroundSurface"
          alignItems="center"
          justifyContent="center"
          onPress={mostrarFoto ? () => setPreviewOpen(true) : undefined}
          pressStyle={mostrarFoto ? { opacity: 0.7 } : undefined}
        >
          {busy ? (
            <Spinner color="$primary" />
          ) : mostrarFoto ? (
            <Image
              source={{ uri: fotoUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <Users size={32} color="#94A3B8" />
          )}
        </View>

        <YStack width="65%" gap="$2" justifyContent="center" paddingRight="$2">
          <Row label="Código" value={empleado.Employee_Code} />
          <Row label="Compañía" value={empleado.Company_Code} />
          <Row label="País" value={empleado.Country_Code} />
        </YStack>
      </XStack>

      <PhotoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        uri={fotoUrl}
        nombre={nombre}
      />

      <PhotoSourceDialog
        open={sourceOpen}
        onOpenChange={setSourceOpen}
        onCamera={tomarFoto}
        onGallery={elegirGaleria}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar foto"
        message={`¿Eliminar la foto de ${nombre}?`}
        confirmColor="#EF4444"
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={eliminarFoto}
      />
    </YStack>
  )
})

export default function PersonalScreen() {
  const { countryCode, flagCode, HeaderTrigger, PickerDialog } = useCountrySelector()
  const [companies, setCompanies] = useState<ICompany[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>('')
  const [data, setData] = useState<IEmployee[]>([])
  const [filtered, setFiltered] = useState<IEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const loader = useLoader()

  const companyOptions = useMemo(
    () =>
      companies.map(c => ({
        label: `${c.COD_EMPRESA} · ${c.DES_NOMBRE_COMERCIAL || c.DES_RAZON_SOCIAL}`,
        value: c.COD_EMPRESA,
        key: c.COD_EMPRESA,
      })),
    [companies]
  )

  const loadCompanies = React.useCallback(async (code: string) => {
    if (!code) {
      setCompanies([])
      setSelectedCompany('')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const resp: ExecutionResponse<ICompany[]> = await recursosHumanosService.getCompanies(code)
      if (resp.Success) {
        const list = resp.Data ?? []
        setCompanies(list)
        const first = list[0]?.COD_EMPRESA ?? ''
        setSelectedCompany(first)
        if (!first) setLoading(false)
      } else {
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }, [])

  const loadEmployees = React.useCallback(async (companyCode: string) => {
    if (!companyCode) {
      setData([])
      setFiltered([])
      setLoading(false)
      return
    }
    try {
      loader.show()
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<IEmployee[]> = await recursosHumanosService.getEmployees(companyCode)
      if (response.Success) {
        setData(response.Data ?? [])
        setFiltered(response.Data ?? [])
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      loader.hide()
    }
  }, [])

  useEffect(() => {
    loadCompanies(countryCode)
  }, [countryCode, loadCompanies])

  useEffect(() => {
    loadEmployees(selectedCompany)
  }, [selectedCompany, loadEmployees])

  const refrescar = () => {
    loadCompanies(countryCode)
    loadEmployees(selectedCompany)
  }

  const renderItem = React.useCallback(
    ({ item }: { item: IEmployee }) => <EmployeeCard empleado={item} />,
    []
  )

  const keyExtractor = React.useCallback(
    (item: IEmployee, index: number) => `${item.Employee_Code}-${index}`,
    []
  )

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Personal
      </Text>
    ),
    right: (
      <XStack gap="$3" alignItems="center">
        {HeaderTrigger}
        <View onPress={refrescar}>
          <RotateCwStyled size={18} />
        </View>
      </XStack>
    )
  }, [flagCode])

  return (
    <YStack
      flex={1}
      backgroundColor="$backgroundPage"
      padding="$3"
    >
      {companies.length > 0 && (
        <AppSelect
          label="Empresa"
          value={selectedCompany}
          onValueChange={v => setSelectedCompany(String(v))}
          options={companyOptions}
          placeholder="Seleccione una empresa"
          disabled={companies.length <= 1}
        />
      )}

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState
          type="server"
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={refrescar}
        />
      ) : (
        <>
          <SearchInput
            data={data}
            searchKeys={['Employee_Name', 'Employee_Code', 'Name', 'LastName']}
            onResults={setFiltered}
            placeholder="Buscar empleado..."
          />

          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState onAction={refrescar} />}
            contentContainerStyle={{ paddingBottom: 8, flexGrow: 1 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
          />

          <RecordCount count={filtered?.length ?? 0} />
        </>
      )}
      {PickerDialog}
    </YStack>
  )
}
