import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import {
  ArrowLeft, Package, User, Send, RotateCcw, TriangleAlert, ShieldAlert, LogOut,
  MessageSquare,
} from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import { ACCENT, ACCENT_BG, estadoVisual, fmtCantidad, fmtFecha, fmtFechaHora } from '../pasesSalida.helpers'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import { IPaseSalida, IPaseSalidaDetalle } from '../../../api/modules/pasesSalida/pases.types'

/**
 * Lo que ve el guardia después de escanear: qué tiene que dejar salir.
 *
 * ESTA PANTALLA ES UNA LISTA DE VERIFICACIÓN, no una ficha del pase. El guardia
 * está parado frente a un carro con cajas; lo único que necesita es contar y
 * comparar. Por eso la cantidad es el elemento más grande de cada línea y el
 * encabezado del pase queda reducido a lo mínimo — quién lo pide y a dónde va.
 *
 * NO SE PUEDE GENERAR LA SALIDA SI EL PASE NO ESTÁ APROBADO. El botón no se
 * esconde, se bloquea con el motivo a la vista: un botón que desaparece deja al
 * guardia sin saber si el problema es el pase o la app.
 *
 * A DÓNDE VA EL PASE al generar la salida lo decide su TIPO: el que regresa
 * queda en "Salió" esperando el retorno; el definitivo queda "Finalizado". Por
 * eso la confirmación lo dice con todas las letras — el guardia no tiene por qué
 * saberlo de memoria. Cancelar sale sin tocar nada.
 */

/** Alto del footer fijo: el scroll reserva ese espacio para no quedar tapado. */
const FOOTER_H = 116

const VERDE = '#22c55e'
const AMBAR = '#f59e0b'

export default function VerificarSalidaScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { showToast } = useShowToast()

  const id: number = route.params?.id
  const correlativo: string = route.params?.correlativo ?? 'Pase'

  const [pase, setPase] = useState<IPaseSalida | null>(null)
  const [detalle, setDetalle] = useState<IPaseSalidaDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [registrando, setRegistrando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [rPase, rDet] = await Promise.all([
        pasesService.getPase(id),
        pasesService.getDetalle(id),
      ])
      // El SP devuelve una fila; el arreglo trae 0 o 1 elemento.
      setPase(rPase.Data?.[0] ?? null)
      setDetalle(rDet.Data ?? [])
      setError(null)
    } catch (e) {
      setPase(null); setDetalle([])
      setError(handleError(e))
    }
  }, [id])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])

  /**
   * Registra la salida. La hora la pone el servidor —el reloj del teléfono no
   * es fuente confiable para un dato que se audita— y el SP vuelve a validar
   * que el pase esté aprobado y que no haya salido ya.
   *
   * Al terminar se vuelve a la lista: el pase deja de estar aprobado y por lo
   * tanto desaparece de ella, que es la confirmación de que quedó hecho.
   */
  const registrarSalida = async () => {
    if (!pase) return
    setRegistrando(true)
    try {
      const res = await pasesService.registrarSalida(pase.Id)
      if (res.Success) {
        setConfirmando(false)
        showToast('success', 'Salida registrada',
          res.SuccessMessage || 'La salida quedó registrada')
        navigation.goBack()
      } else {
        // Puede haber salido entre que se escaneó y se confirmó: se recarga
        // para que la pantalla deje de ofrecer algo que ya no se puede.
        setConfirmando(false)
        showToast('error', 'No se pudo registrar', res.ErrorMessage || 'Intente de nuevo')
        await cargar()
      }
    } catch (e: any) {
      setConfirmando(false)
      showToast('error', 'Error', e?.message || 'No se pudo registrar la salida')
    } finally { setRegistrando(false) }
  }

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text" numberOfLines={1}>{pase?.Correlativo ?? correlativo}</Text>,
  })

  if (loading) {
    return <View flex={1} backgroundColor="$background"><SkeletonList /></View>
  }

  if (error) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type={error.type} title={error.title} message={error.message} errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      </View>
    )
  }

  if (!pase) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type="general"
          title="No se encontró el pase"
          message="El código no corresponde a ningún pase vigente."
          onRetry={() => navigation.goBack()}
          retryLabel="Volver"
        />
      </View>
    )
  }

  const est = estadoVisual(pase.Estado)
  const aprobado = pase.Estado === 'PSAPR'
  // Ya salió: PSSAL espera el retorno, PSFIN y PSRET ya cerraron. En los tres
  // el pase cruzó la puerta y no puede volver a cruzarla.
  const yaSalio = ['PSSAL', 'PSFIN', 'PSRET'].includes(pase.Estado)
  const totalLineas = detalle.length

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: FOOTER_H + 16 }}>

        {/* ── El pase, en lo mínimo ── */}
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
          borderLeftWidth={4} borderLeftColor={est.color} borderWidth={1} borderColor="$border"
          padding="$4" gap="$2.5" {...shadows.sm}>

          <XStack alignItems="center" gap="$2">
            <Text flex={1} fontSize={18} fontWeight="900" color="$text">{pase.Correlativo}</Text>
            <View backgroundColor={est.bg} borderWidth={1} borderColor={est.color}
              paddingHorizontal="$2.5" paddingVertical={4} borderRadius="$10">
              <Text fontSize={10} fontWeight="800" color={est.color}>
                {pase.EstadoNombre || est.label}
              </Text>
            </View>
          </XStack>

          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <View backgroundColor={ACCENT} borderRadius="$3" paddingHorizontal="$3" paddingVertical={5}>
              <Text fontSize={12} fontWeight="900" color="#fff">{pase.TipoSalida}</Text>
            </View>
            {pase.Retorna ? (
              <View backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={5}
                flexDirection="row" alignItems="center" gap={5}>
                <RotateCcw size={11} color={ACCENT} />
                <Text fontSize={10} fontWeight="800" color={ACCENT}>Debe regresar</Text>
              </View>
            ) : null}
          </XStack>

          {pase.EnviadoA ? (
            <XStack alignItems="flex-start" gap="$2">
              <Send size={13} color={theme.textMuted?.val} style={{ marginTop: 1 }} />
              <Text flex={1} fontSize={12} color="$text" fontWeight="600">{pase.EnviadoA}</Text>
            </XStack>
          ) : null}
          <XStack alignItems="center" gap="$2">
            <User size={13} color={theme.textMuted?.val} />
            <Text flex={1} fontSize={11} color="$textMuted">
              {pase.Solicitante || pase.Create_By}
              {pase.Empresa ? ` · ${pase.Empresa}` : ''}
              {pase.FechaSalida ? ` · Sale ${fmtFecha(pase.FechaSalida)}` : ''}
            </Text>
          </XStack>

          {/* El comentario es contexto del pase, no una línea que salga: va acá
              y no al final, donde quedaba después de la lista a verificar. */}
          {pase.Comentario ? (
            <XStack alignItems="flex-start" gap="$2" marginTop={2} paddingTop="$2.5"
              borderTopWidth={1} borderTopColor="$border">
              <MessageSquare size={13} color={theme.textMuted?.val} style={{ marginTop: 1 }} />
              <Text flex={1} fontSize={11} color="$text">{pase.Comentario}</Text>
            </XStack>
          ) : null}
        </YStack>

        <View height={14} />

        {/* ── El aviso: es la razón de que esta pantalla exista ── */}
        {aprobado ? (
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(245, 158, 11, 0.15)"
            borderWidth={1} borderColor={AMBAR} borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <TriangleAlert size={16} color={AMBAR} style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={12} fontWeight="900" color={AMBAR}>Revise antes de dejar salir</Text>
              <Text fontSize={11} color={AMBAR} fontWeight="600">
                Cuente cada línea y compárela con lo que va en el vehículo. Si algo
                no coincide —cantidad, marca o número de serie— no genere la salida.
              </Text>
            </YStack>
          </XStack>
        ) : (
          /* El pase no está aprobado: eso manda sobre todo lo demás, así que el
             aviso cambia de tono y de contenido. */
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(239, 68, 68, 0.15)"
            borderWidth={1} borderColor="#ef4444" borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <ShieldAlert size={16} color="#ef4444" style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={12} fontWeight="900" color="#ef4444">
                {yaSalio ? 'Este pase ya salió' : 'Este pase no puede salir'}
              </Text>
              <Text fontSize={11} color="#ef4444" fontWeight="600">
                {yaSalio
                  /* Un segundo escaneo del mismo pase no es un error del guardia:
                     puede ser el mismo papel dando vueltas. Se le dice cuándo
                     salió y quién lo registró, para que pueda averiguar. */
                  ? `Salió el ${fmtFechaHora(pase.FechaSalidaReal)}${
                      pase.SalidaPorNombre || pase.SalidaPor
                        ? `, registrado por ${pase.SalidaPorNombre || pase.SalidaPor}`
                        : ''
                    }.`
                  : `Está en "${pase.EstadoNombre || est.label}" y solo puede salir lo que está aprobado. No deje salir nada de este pase.`}
              </Text>
            </YStack>
          </XStack>
        )}

        {/* ── Qué sale: lo importante de la pantalla ── */}
        <XStack alignItems="center" gap="$2" paddingHorizontal="$1" paddingBottom="$2">
          <Package size={15} color={theme.primary?.val} />
          <Text flex={1} fontSize="$3" fontWeight="900" color="$text">
            Qué debe salir ({totalLineas})
          </Text>
        </XStack>

        <YStack gap="$2.5">
          {detalle.map((d, i) => (
            <XStack key={d.Id} backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="$border" padding="$3.5" gap="$3" {...shadows.sm}>

              {/* La cantidad es lo que el guardia compara, así que es lo más
                  grande de la línea y no un dato al final del renglón. */}
              <YStack minWidth={62} alignItems="center" justifyContent="center"
                backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                borderRadius="$4" paddingHorizontal="$2" paddingVertical="$2.5">
                <Text fontSize={22} fontWeight="900" color={ACCENT} lineHeight={24}>
                  {fmtCantidad(d.Cantidad)}
                </Text>
                <Text fontSize={9} fontWeight="800" color={ACCENT}>
                  {(d.UnidadMedida || 'Unidad').toUpperCase()}
                </Text>
              </YStack>

              <YStack flex={1} gap={3} justifyContent="center">
                {/* La descripción arriba y en grande: es lo que identifica el
                    producto. El material es la categoría. */}
                <Text fontSize={14} fontWeight="800" color="$text">
                  {d.Descripcion || d.Material}
                </Text>
                <Text fontSize={11} color="$textMuted">
                  {d.Material}{d.EsEquipo ? ' · Equipo' : ''}
                </Text>

                {d.Marca || d.Modelo || d.Serie ? (
                  <XStack flexWrap="wrap" gap="$1.5" marginTop={2}>
                    {[
                      d.Marca ? { l: 'Marca', v: d.Marca } : null,
                      d.Modelo ? { l: 'Modelo', v: d.Modelo } : null,
                      d.Serie ? { l: 'Serie', v: d.Serie } : null,
                    ].filter(Boolean).map((f: any) => (
                      <YStack key={f.l} borderWidth={1} borderColor="$border" borderRadius="$3"
                        paddingHorizontal="$2" paddingVertical={3}>
                        <Text fontSize={8} color="$textMuted" fontWeight="700">{f.l.toUpperCase()}</Text>
                        <Text fontSize={11} color="$text" fontWeight="800">{f.v}</Text>
                      </YStack>
                    ))}
                  </XStack>
                ) : null}
              </YStack>

              <Text fontSize={11} color="$textMuted" fontWeight="700" alignSelf="flex-start">
                {i + 1}/{totalLineas}
              </Text>
            </XStack>
          ))}

          {totalLineas === 0 ? (
            <YStack alignItems="center" paddingVertical="$6" gap="$2">
              <Package size={24} color={theme.textMuted?.val} />
              <Text fontSize="$2" color="$textMuted">Este pase no tiene líneas.</Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      {/* Footer fijo con las dos salidas del flujo. */}
      <YStack position="absolute" left={0} right={0} bottom={0}
        backgroundColor="$background" borderTopWidth={1} borderTopColor="$border"
        paddingHorizontal="$3" paddingTop="$2.5" paddingBottom="$3" gap="$2">

        {!aprobado ? (
          <Text fontSize={10} color="#ef4444" fontWeight="700" textAlign="center">
            Solo se puede generar la salida de un pase aprobado.
          </Text>
        ) : null}

        <XStack gap="$2.5">
          {/* Cancelar no toca nada: vuelve a la lista y ya. */}
          <View flex={1} onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.85 }}
            borderWidth={1.5} borderColor="$border" borderRadius="$4" height={48}
            alignItems="center" justifyContent="center">
            <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
          </View>

          {/* Bloqueado en vez de escondido: si desaparece, el guardia no sabe si
              el problema es el pase o la app. */}
          <View flex={1}
            onPress={aprobado && !registrando ? () => setConfirmando(true) : undefined}
            pressStyle={aprobado ? { opacity: 0.85 } : undefined}
            opacity={aprobado && !registrando ? 1 : 0.45}
            backgroundColor={aprobado ? VERDE : '$border'} borderRadius="$4" height={48}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            <LogOut size={17} color="#fff" />
            <Text color="#fff" fontWeight="800" fontSize="$3">Generar salida</Text>
          </View>
        </XStack>
      </YStack>

      {/* La confirmación no es un trámite: es donde se dice QUÉ va a pasar
          después, que es distinto según el tipo y el guardia no lo tiene por qué
          saber de memoria. */}
      <ConfirmDialog
        open={confirmando}
        onOpenChange={(o: boolean) => { if (!o && !registrando) setConfirmando(false) }}
        loading={registrando}
        title="Registrar salida"
        message={`Se registrará la salida de ${pase.Correlativo} con la hora de este momento.`}
        extra={
          <YStack gap="$2">
            <XStack alignItems="flex-start" gap="$2" backgroundColor={ACCENT_BG}
              borderWidth={1} borderColor={ACCENT} borderRadius="$3"
              paddingHorizontal="$2.5" paddingVertical="$2">
              {pase.Retorna
                ? <RotateCcw size={13} color={ACCENT} style={{ marginTop: 1 }} />
                : <LogOut size={13} color={ACCENT} style={{ marginTop: 1 }} />}
              <Text flex={1} fontSize={11} color={ACCENT} fontWeight="700">
                {pase.Retorna
                  ? 'Este pase debe regresar: quedará en "Salió", esperando que se registre el retorno.'
                  : 'Es una salida definitiva: el pase quedará "Finalizado" y no habrá nada más que hacer con él.'}
              </Text>
            </XStack>
            <Text fontSize={10} color="$textMuted">
              {totalLineas === 1
                ? 'Confirme que la línea del pase coincide con lo que va saliendo.'
                : `Confirme que las ${totalLineas} líneas del pase coinciden con lo que va saliendo.`}
            </Text>
          </YStack>
        }
        confirmLabel="Registrar salida"
        confirmColor={VERDE}
        onConfirm={registrarSalida}
      />
    </View>
  )
}
