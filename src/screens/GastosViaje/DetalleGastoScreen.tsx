import React, { useState } from 'react'
import { ScrollView, TouchableOpacity, Image, Modal, StyleSheet, ActivityIndicator } from 'react-native'
import ImageViewing from 'react-native-image-viewing'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import {
  ArrowLeft, CheckCircle2, RefreshCw, XCircle, AlertTriangle,
  ImageOff, ThumbsUp, ThumbsDown,
  LucideIcon,
} from 'lucide-react-native'
import { usePageHeader } from '../../hooks/usePageHeader'
import { IGastoHistorialDetail } from '../../api/modules/GastosViaje/gastosViaje.types'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../../context/AuthContext'
import { useLoader } from '../../providers/LoaderProvider'
import { useShowToast } from '../../utils/useShowToast'
import { gastosViajeService } from '../../api/modules/GastosViaje/gastosViaje.service'
import CountryFlag from '../../components/commons/CountryFlag'
import AppInput from '../../components/commons/AppInput'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import dayjs from 'dayjs'
import { formatCurrency } from './GastosViaje.utils'
import {ECompany} from '../../api/modules/GastosViaje/gastosViaje.types'

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <XStack justifyContent="space-between" alignItems="flex-start" paddingVertical="$2" borderBottomWidth={1} borderBottomColor="$border">
      <Text fontSize={13} color="$textMuted" flex={1}>{label}</Text>
      <Text fontSize={13} fontWeight="600" color="$text" flex={1} textAlign="right">{String(value)}</Text>
    </XStack>
  )
}

export default function DetalleGastoScreen({ route }: any) {
  const theme = useTheme()
  const gasto: IGastoHistorialDetail = route.params?.gasto
  const isApprovalMode: boolean = route.params?.mode === 'approval'
  const navigation = useNavigation()
  const { user, defaultCompany } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()

  const STATUS_CONFIG: Record<string, { bg: string; color: string; Icon: LucideIcon }> = {
    Sincronizado: { bg: `${theme.success?.val}1f`, color: theme.success?.val as string, Icon: CheckCircle2 },
    Pendiente:    { bg: `${theme.warning?.val}1f`, color: theme.warning?.val as string, Icon: RefreshCw },
    Rechazado:    { bg: `${theme.error?.val}1f`,   color: theme.error?.val as string,   Icon: XCircle },
  }

  const status = STATUS_CONFIG[gasto.StatusName]
  const StatusIcon = status?.Icon ?? CheckCircle2;
  const [imageOpen, setImageOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(!!gasto.ImagePath)
  const [rejectModalVisible, setRejectModalVisible] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  // El Modal de RN abre su propia ventana en Android, así que ni adjustResize ni un
  // KeyboardAvoidingView lo suben: le restamos al backdrop lo que tapa el teclado.
  const { inset: keyboardInset, onLayout: onRejectBackdropLayout } = useKeyboardInset()
  const isCombustible    =  gasto?.ExpenseCategoryName?.toLowerCase().includes('combustible') && gasto.CompanyCode=== 'IMGT'

  const STATUS_CONFIG: Record<string, { bg: string; color: string; Icon: LucideIcon }> = {
    Sincronizado: { bg: `${theme.success?.val}1f`, color: theme.success?.val as string, Icon: CheckCircle2 },
    Pendiente:    { bg: `${theme.gray?.val}1f`, color: theme.gray?.val as string, Icon: RefreshCw },
    Rechazado:    { bg: `${theme.error?.val}1f`,   color: theme.error?.val as string,   Icon: XCircle },
    PendienteAX:  { bg: `${theme.warning?.val}1f`, color: theme.warning?.val as string, Icon: RefreshCw }
  }

  const status = STATUS_CONFIG[gasto?.StatusName ?? 'Pendiente']
  const StatusIcon = status?.Icon ?? CheckCircle2

  usePageHeader({
    left: (
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <ArrowLeft size={22} color={theme.text?.val as string} />
      </TouchableOpacity>
    ),
    center: <Text fontSize={16} fontWeight="700" color="$text">Detalle de Gasto</Text>,
    right: <CountryFlag countryCode={defaultCompany?.CodeIcon ?? 'HN'} width={28} height={20} />,
  })

  if (!gasto) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text color="$textMuted">No se encontró el gasto</Text>
      </View>
    )
  }

  const handleApprove = async () => {
    try {
      setActionLoading(true)
      loader.show()
      const res = await gastosViajeService.approveGasto({
        GastoId: gasto.Id,
        ApproverCode: user?.Code ?? '',
        Company: defaultCompany?.Code ?? '',
        FinansiCode: user?.Payweb ?? '',
      }, user?.Code ?? '')
      if (res.Success) {
        showToast('success', 'Aprobado', 'El gasto fue aprobado correctamente', 3000, 'top')
        navigation.goBack()
      } else {
        showToast('error', 'Error', 'No se pudo aprobar el gasto', 4000, 'top')
      }
    } catch (error:any) {
      let responseData;

      try {
        responseData =
          typeof error.response === 'string'
            ? JSON.parse(error.response)
            : error.response?.data;
      } catch {
        responseData = null;
      }

      showToast(
        'error',
        'Error',
        responseData?.Message ?? 'Ocurrió un error inesperado',
        8000,
        'top'
      );
    } finally {
      setActionLoading(false)
      loader.hide()
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      setRejectError('Debes ingresar un motivo de rechazo')
      return
    }
    try {
      setActionLoading(true)
      loader.show()
      const res = await gastosViajeService.rejectGasto({
        GastoId: gasto.Id,
        ApproverCode: user?.Code ?? '',
        Company: defaultCompany?.Code ?? '',
        Reason: rejectReason.trim(),
        FinansiCode: user?.Payweb ?? '',
      }, user?.Code ?? '')
      if (res.Success) {
        setRejectModalVisible(false)
        showToast('success', 'Rechazado', 'El gasto fue rechazado correctamente', 3000, 'top')
        navigation.goBack()
      } else {
        showToast('error', 'Error', 'No se pudo rechazar el gasto', 4000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 4000, 'top')
    } finally {
      setActionLoading(false)
      loader.hide()
    }
  }

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: theme.backgroundPage?.val as string }} showsVerticalScrollIndicator={false}>

        <YStack backgroundColor="$backgroundPage" paddingBottom="$4" >

          {/* ── Hero: imagen (solo si viene ImagePath) ── */}
          {!!gasto.ImagePath && (
            <View
              height={340}
              backgroundColor="$backgroundElevated"
              justifyContent="center"
              alignItems="center"
              overflow="hidden"
            >
              {!imageError ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => { if (!imageLoading) setImageOpen(true) }}
                  style={{ width: '100%', height: 340 }}
                >
                  <Image
                    source={{ uri: gasto.ImagePath }}
                    style={{ width: '100%', height: 340 }}
                    resizeMode="cover"
                    onLoadEnd={() => setImageLoading(false)}
                    onError={() => { setImageError(true); setImageLoading(false) }}
                  />
                  {imageLoading && (
                    <View
                      position="absolute" top={0} left={0} right={0} bottom={0}
                      justifyContent="center" alignItems="center"
                      backgroundColor="$backgroundElevated"
                    >
                      <ActivityIndicator size="large" color={theme.primary?.val as string} />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <YStack alignItems="center" gap="$2">
                  <View
                    width={80} height={80} borderRadius={40}
                    backgroundColor="$backgroundSurface"
                    justifyContent="center" alignItems="center"
                  >
                    <ImageOff size={38} color={theme.textMuted?.val as string} opacity={0.5} />
                  </View>
                  <Text fontSize={13} color="$textMuted">No se pudo cargar la imagen</Text>
                </YStack>
              )}
            </View>
          )}

          {/* ── Strip: monto + estado ── */}
          <View backgroundColor="$primary" paddingHorizontal={20} paddingVertical={16}>
            <Text color="white" fontSize={12} opacity={0.8} marginBottom={2}>
              {gasto.ExpenseTypeName} — {gasto.ExpenseCategoryName}
            </Text>
            <Text color="white" fontSize={30} fontWeight="800" lineHeight={34}>
              { gasto.Currency + ' ' + formatCurrency(gasto.InvoiceAmount)}
            </Text>
            <XStack justifyContent="space-between" alignItems="center" marginTop={8}>
              <Text color="white" fontSize={12} opacity={0.75}>{dayjs(gasto.InvoiceDate).format('DD/MM/YYYY')}</Text>
              <XStack
                paddingHorizontal={10} paddingVertical={4}
                borderRadius={20} alignItems="center" gap="$1"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <StatusIcon size={11} color="white" />
                <Text fontSize={11} fontWeight="700" color="white">{gasto.StatusName}</Text>
              </XStack>
            </XStack>
          </View>

          <YStack paddingHorizontal={16} paddingTop={16} gap="$3">

            {/* Solicitante — solo en modo aprobación */}
            {isApprovalMode && (gasto.PersonalCode || gasto.Name) && (
              <Card backgroundColor="$backgroundElevated" borderRadius={12} padding="$4" borderWidth={1} borderColor="$border">
                <Text fontSize={14} fontWeight="700" color="$text" marginBottom="$3">Solicitante</Text>
                <InfoRow label="Código" value={gasto.PersonalCode} />
                <InfoRow label="Nombre" value={gasto.Name} />
              </Card>
            )}

            {/* Motivo de rechazo */}
            {gasto.StatusName === 'Rechazado' && gasto.RejectionMotive && (
              <Card backgroundColor={`${theme.error?.val}0f`} borderRadius={10} padding="$3" borderWidth={1} borderColor={`${theme.error?.val}33`}>
                <XStack gap="$2" alignItems="flex-start">
                  <AlertTriangle size={16} color={theme.error?.val as string} style={{ marginTop: 2 }} />
                  <YStack flex={1} gap="$1">
                    <Text fontSize={12} fontWeight="700" color="$error">Motivo de rechazo</Text>
                    <Text fontSize={13} color="$text">{gasto.RejectionMotive}</Text>
                  </YStack>
                </XStack>
              </Card>
            )}

            {/* Datos de factura */}
            <Card backgroundColor="$backgroundElevated" borderRadius={12} padding="$4" borderWidth={1} borderColor="$border">
              <Text fontSize={14} fontWeight="700" color="$text" marginBottom="$3">Datos de la factura</Text>
              <InfoRow label="Número de factura"   value={gasto.InvoiceId} />
              <InfoRow label="Número de serie"     value={gasto.JournalNum} />
              <InfoRow label="Descripción"         value={gasto.Description} />
              <InfoRow label="Importe gravado"     value={gasto.Currency + ' ' + formatCurrency(gasto.GravadoAmount)} />
              <InfoRow label="Importe exento"      value={gasto.Currency + ' ' + formatCurrency(gasto.ExemptAmount)} />
              <InfoRow label="Total"               value={gasto.Currency + ' ' + formatCurrency(gasto.InvoiceAmount)} />
              
              <InfoRow label="Tipo de combustible" value={gasto.FuelTypeName} />
              <InfoRow label="Fecha de factura"    value={dayjs(gasto.InvoiceDate).format('DD/MM/YYYY')} />
              <InfoRow label="Fecha de registro"   value={dayjs(gasto.CreationDate).format('DD/MM/YYYY h:mm a')} />
            </Card>

            {/* Proveedor */}
            <Card backgroundColor="$backgroundElevated" borderRadius={12} padding="$4" borderWidth={1} borderColor="$border">
              <Text fontSize={14} fontWeight="700" color="$text" marginBottom="$3">Proveedor</Text>
              <InfoRow label="Nombre"        value={gasto.VendName} />
              <InfoRow label="Código"        value={gasto.VendAccount} />
              <InfoRow label={gasto.CompanyCode == ECompany.IMGT ? 'NIT' : 'RTN'}     value={gasto.VatNum} />
            </Card>

            {/* Acciones */}
            {isApprovalMode && gasto.Code === 'P' ? (
              <XStack gap="$3">
                <Button
                  flex={1} height={48} borderRadius={12}
                  backgroundColor="$backgroundElevated"
                  borderWidth={1} borderColor={theme.error?.val as string}
                  pressStyle={{ opacity: 0.7 }}
                  disabled={actionLoading}
                  onPress={() => { setRejectReason(''); setRejectError(''); setRejectModalVisible(true) }}
                >
                  <XStack gap="$2" alignItems="center">
                    <ThumbsDown size={16} color={theme.error?.val as string} />
                    <Text color="$error" fontWeight="600">Rechazar</Text>
                  </XStack>
                </Button>
                <Button
                  flex={1} height={48} borderRadius={12}
                  backgroundColor="$success"
                  pressStyle={{ opacity: 0.8 }}
                  disabled={actionLoading}
                  onPress={handleApprove}
                >
                  <XStack gap="$2" alignItems="center">
                    <ThumbsUp size={16} color="white" />
                    <Text color="white" fontWeight="700">Aprobar</Text>
                  </XStack>
                </Button>
              </XStack>
            ) : (
              <Button
                height={48} borderRadius={12}
                backgroundColor="$backgroundElevated"
                borderWidth={1} borderColor="$border"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => navigation.goBack()}
              >
                <Text color="$text" fontWeight="600">Volver al historial</Text>
              </Button>
            )}

          </YStack>
        </YStack>
      </ScrollView>

      <ImageViewing
        images={[{ uri: gasto.ImagePath ?? '' }]}
        imageIndex={0}
        visible={imageOpen}
        onRequestClose={() => setImageOpen(false)}
      />

      {/* Modal rechazo */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.backdrop, { paddingBottom: 24 + keyboardInset }]}
          onLayout={onRejectBackdropLayout}
          onPress={() => setRejectModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}
          >
            {/* El texto y el campo scrollean; los botones quedan siempre visibles abajo. */}
            <ScrollView
              style={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text fontSize={17} fontWeight="700" color="$text" marginBottom="$1">
                Motivo de rechazo
              </Text>
              <Text fontSize={13} color="$textMuted" marginBottom="$3">
                Indica por qué rechazas este gasto
              </Text>
              <AppInput
                label="Motivo"
                multiline
                minLines={4}
                placeholder="Ej: Factura ilegible, monto incorrecto..."
                value={rejectReason}
                onChangeText={v => { setRejectReason(v); setRejectError('') }}
                error={rejectError}
                style={{height: 140}}
                autoFocus
              />
            </ScrollView>

            <XStack gap="$3" marginTop={16} flexShrink={0}>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$backgroundSurface"
                borderWidth={1} borderColor="$border"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text color="$text" fontWeight="600">Cancelar</Text>
              </Button>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$error"
                pressStyle={{ opacity: 0.8 }}
                disabled={actionLoading}
                onPress={handleConfirmReject}
              >
                <Text color="white" fontWeight="700">Confirmar</Text>
              </Button>
            </XStack>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    // Con el teclado abierto el backdrop tiene menos espacio: la tarjeta se encoge hasta
    // ese máximo en lugar de desbordarse fuera de la pantalla.
    flexShrink: 1,
  },
  modalBody: {
    flexShrink: 1,
    flexGrow: 0,
  }
})
