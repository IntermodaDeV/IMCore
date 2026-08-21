import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import { CalendarDays, Check, CheckSquare, Clock, Square, UserRound, X } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { useShowToast } from '../../utils/useShowToast'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppSelect from '../../components/commons/AppSelect'
import AppInput from '../../components/commons/AppInput'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { subscribeOpenSolicitudHoraExtra } from '../../services/overtimeNavigation'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeApprovalImpact,
  IOvertimeRequestDetail,
  IUserEntity,
} from '../../api/modules/overtime/overtime.types'
import {
  DistribucionHoras,
  fmtFecha,
  fmtHora,
  fmtHoras,
  nombreConCodigo,
  parseConceptos,
} from './Overtime.utils'


/**
 * ¿Esta entidad todavía puede firmar este renglón?
 *
 * La columna de estado de cada entidad viaja en DynamicColumns como
 * `Status_<NombreSinEspacios>`; solo 'Pendiente' habilita la decisión.
 * 'Aprobado' y 'Rechazado' significan que esta misma entidad ya se pronunció, y
 * 'No aplica' que una etapa anterior rechazó y el flujo se cortó.
 *
 * La bandeja ya viene filtrada por el procedimiento, así que en condiciones
 * normales todo lo que se ve es firmable. La comprobación existe igual para el
 * lote: si algo se coló —una lista vieja en pantalla, un renglón resuelto desde
 * otro lado— es preferible dejarlo fuera del envío que mandarlo y que el SP lo
 * rechace a mitad del lote.
 */
const puedeAutorizar = (item: IOvertimeRequestDetail, nombreEntidad: string): boolean => {
  if (!nombreEntidad) return true

  const columna = `Status_${nombreEntidad.replace(/\s+/g, '')}`
  const estado = String(item?.DynamicColumns?.[columna] ?? '').trim()

  // Sin columna de estado no hay motivo para bloquear: puede ser una entidad
  // que el procedimiento no expone.
  return estado === '' || estado === 'Pendiente'
}

/** 'Juan Pérez' o '3 empleados · 12h 30m' para los textos del lote. */
const resumenLote = (detalles: IOvertimeRequestDetail[]): string => {
  const horas = detalles.reduce((acc, d) => acc + (d.Total_Overtime_Hours ?? 0), 0)

  if (detalles.length === 1) {
    return `${fmtHoras(detalles[0].Total_Overtime_Hours)} de ${nombreConCodigo(
      detalles[0].Employee_Name,
      detalles[0].Employee_Code,
    )}`
  }

  return `${detalles.length} solicitudes · ${fmtHoras(horas)}`
}

export default function SolicitudesHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const loader = useLoader()
  const theme = useTheme()
  const { showToast } = useShowToast()
  const keyboardHeight = useKeyboardHeight()

  const [entidades, setEntidades] = useState<IUserEntity[]>([])
  const [entidad, setEntidad] = useState<string>('')
  const [data, setData] = useState<IOvertimeRequestDetail[]>([])
  const [filtered, setFiltered] = useState<IOvertimeRequestDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  // Aprobar y rechazar trabajan sobre una LISTA: una tarjeta suelta es un lote
  // de uno. Así el confirm, el envío y el mensaje son un solo camino en vez de
  // dos que hay que mantener parejos.
  const [aprobando, setAprobando] = useState<IOvertimeRequestDetail[] | null>(null)
  const [rechazando, setRechazando] = useState<IOvertimeRequestDetail[] | null>(null)

  // Ids marcados para resolver en lote.
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // Impacto de la firma sobre el presupuesto. Solo llega con contenido en la
  // última etapa del flujo, que es la que compromete el dinero.
  const [impacto, setImpacto] = useState<IOvertimeApprovalImpact[]>([])
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resaltadaId, setResaltadaId] = useState<number | null>(null)
  const listaRef = useRef<FlatList<IOvertimeRequestDetail> | null>(null)

  const companyCode = defaultCompany?.Code ?? ''

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes de Horas Extra
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  const loadEntidades = useCallback(async () => {
    if (!companyCode) return
    try {
      const res = await overtimeService.getRequestEntities(companyCode)
      const lista = res.Success ? res.Data ?? [] : []
      setEntidades(lista)

      // Al cambiar de empresa la entidad anterior puede ya no existir.
      setEntidad(prev => {
        const sigueValida = prev && lista.some(e => String(e.Id) === prev)
        return sigueValida ? prev : lista.length ? String(lista[0].Id) : ''
      })
    } catch (err) {
      setError(handleError(err))
    }
  }, [companyCode])

  const loadData = useCallback(async (silent = false) => {
    if (!companyCode || !entidad) {
      setData([])
      setFiltered([])
      return
    }

    try {
      if (silent) {
        setRefreshing(true)
      } else {
        loader.show()
        setLoading(true)
      }
      setError(null)

      const res = await overtimeService.getRequestDetails(companyCode, Number(entidad))

      // Sin esto, un error del backend (Success=false) se vería como bandeja vacía.
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudieron cargar las solicitudes')

      const filas = res.Data ?? []
      setData(filas)
      setFiltered(filas)

      // Lo que ya no está en la bandeja no se puede seguir teniendo marcado.
      setSeleccionados(prev => {
        const vigentes = new Set(filas.map(d => d.Id))
        const quedan = new Set([...prev].filter(id => vigentes.has(id)))
        return quedan.size === prev.size ? prev : quedan
      })
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
      loader.hide()
    }
  }, [companyCode, entidad])

  /**
   * Registra la decisión sobre uno o varios detalles.
   *
   * Va en UNA sola llamada y no una por detalle: el endpoint recibe la lista y
   * el procedimiento la resuelve en una transacción. Mandarlas de a una dejaría
   * lotes a medio aplicar si algo falla en el camino.
   */
  const enviarDecision = useCallback(
    async (detalles: IOvertimeRequestDetail[], aprobar: boolean, comentario: string) => {
      if (detalles.length === 0) return

      try {
        setEnviando(true)
        loader.show()

        const ids = detalles.map(d => d.Id)

        const res = await overtimeService.authorizeRequest(companyCode, {
          SystemEntities_Id: Number(entidad),
          Auth: aprobar,
          Comment: comentario,
          Details: ids,
        })

        if (!res.Success) {
          showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
          return
        }

        const resueltos = new Set(ids)
        const quitar = (lista: IOvertimeRequestDetail[]) => lista.filter(d => !resueltos.has(d.Id))
        setData(quitar)
        setFiltered(quitar)

        setSeleccionados(prev => new Set([...prev].filter(id => !resueltos.has(id))))
        setAprobando(null)
        setRechazando(null)
        setMotivo('')

        showToast(
          'success',
          aprobar ? 'Aprobado' : 'Rechazado',
          detalles.length === 1
            ? `Horas extra de ${nombreConCodigo(detalles[0].Employee_Name, detalles[0].Employee_Code)}`
            : `${detalles.length} solicitudes de horas extra`,
          3000,
          'top',
        )
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 5000, 'top')
      } finally {
        setEnviando(false)
        loader.hide()
      }
    },
    [companyCode, entidad, loader, showToast],
  )

  /**
   * Pide el impacto sobre el presupuesto de lo que se está por aprobar.
   *
   * De mejor esfuerzo: si falla, el confirm sale sin el bloque. Es información
   * de apoyo para decidir, no un requisito para poder firmar — dejar de
   * aprobar porque no se pudo pintar un porcentaje sería peor.
   */
  const pedirImpacto = useCallback(
    async (detalles: IOvertimeRequestDetail[]) => {
      setImpacto([])
      if (!companyCode || !entidad || detalles.length === 0) return

      try {
        const res = await overtimeService.getApprovalImpact(
          companyCode,
          Number(entidad),
          detalles.map(d => d.Id),
        )

        // Se piden las dos condiciones: que sea la última firma —antes no se
        // compromete nada— y que el usuario pueda ver montos. Sin lo segundo el
        // bloque quedaría vacío, porque ahora ES el dinero.
        const filas = res?.Success && res.Data
          ? res.Data.filter(r => r.Es_Ultima_Entidad && r.Ve_Costo)
          : []
        setImpacto(filas)
      } catch {
        setImpacto([])
      }
    },
    [companyCode, entidad],
  )

  /** Abrir el confirm de aprobar: se muestra ya y el impacto llega después. */
  const abrirAprobacion = useCallback(
    (detalles: IOvertimeRequestDetail[]) => {
      setAprobando(detalles)
      pedirImpacto(detalles)
    },
    [pedirImpacto],
  )

  const confirmarRechazo = useCallback(() => {
    if (!rechazando || rechazando.length === 0) return
    const texto = motivo.trim()
    if (texto.length < 10) {
      setMotivoError('Indica el motivo del rechazo (al menos 10 caracteres)')
      return
    }

    enviarDecision(rechazando, false, texto)
  }, [rechazando, motivo, enviarDecision])

  useEffect(() => {
    loadEntidades()
  }, [loadEntidades])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData]),
  )

  useEffect(() => {
    const unsub = subscribeOpenSolicitudHoraExtra(requestId => {
      setResaltadaId(requestId)
      loadData(true)

      // Se espera a que la recarga pinte la lista antes de buscar la posición.
      setTimeout(() => {
        const indice = filtradosRef.current.findIndex(d => d.Request_Id === requestId)
        if (indice >= 0) {
          listaRef.current?.scrollToIndex({ index: indice, animated: true, viewPosition: 0 })
        }
      }, 350)

      setTimeout(() => setResaltadaId(null), 2600)
    })
    return unsub
  }, [loadData])

  const opcionesEntidad = useMemo(
    () => entidades.map(e => ({ label: e.Name, value: String(e.Id) })),
    [entidades],
  )

  // El nombre de la entidad activa es lo que arma el nombre de su columna de
  // estado, y con eso se sabe si le toca firmar cada renglón.
  const nombreEntidad = useMemo(
    () => entidades.find(e => String(e.Id) === entidad)?.Name ?? '',
    [entidades, entidad],
  )

  const alternarSeleccion = useCallback((id: number) => {
    setSeleccionados(prev => {
      const copia = new Set(prev)
      if (copia.has(id)) copia.delete(id)
      else copia.add(id)
      return copia
    })
  }, [])

  /**
   * Lo marcado que ADEMÁS se puede firmar, que es lo único que se manda.
   *
   * Se recorre lo filtrado y no lo seleccionado: si el buscador dejó una
   * tarjeta fuera de la vista, sigue contando —está marcada— pero se resuelve
   * contra la lista real de la bandeja.
   */
  const seleccionValida = useMemo(
    () => data.filter(d => seleccionados.has(d.Id) && puedeAutorizar(d, nombreEntidad)),
    [data, seleccionados, nombreEntidad],
  )

  // Marcadas que quedan fuera del envío. Se cuentan para que el número no
  // sorprenda al confirmar.
  const bloqueadas = seleccionados.size - seleccionValida.length

  const seleccionarTodas = useCallback(() => {
    // Solo las visibles y firmables: "todas" sobre una lista filtrada tiene que
    // significar las que se están viendo.
    const marcables = filtered.filter(d => puedeAutorizar(d, nombreEntidad)).map(d => d.Id)
    const todasMarcadas = marcables.length > 0 && marcables.every(id => seleccionados.has(id))

    setSeleccionados(prev => {
      const copia = new Set(prev)
      marcables.forEach(id => (todasMarcadas ? copia.delete(id) : copia.add(id)))
      return copia
    })
  }, [filtered, nombreEntidad, seleccionados])

  // El callback del bus se registra una sola vez, así que leería un `filtered`
  // viejo. La ref siempre tiene el actual.
  const filtradosRef = useRef(filtered)
  useEffect(() => { filtradosRef.current = filtered }, [filtered])

  /**
   * Conteo del pie de los filtros.
   *
   * Se cuenta sobre lo FILTRADO, que es lo que se está viendo, pero cuando el
   * buscador recortó la lista se dice también el total: si no, parecería que la
   * bandeja tiene menos de lo que tiene.
   */
  const resumen = useMemo(() => {
    const empleados = new Set(filtered.map(d => d.Employee_Code)).size
    const horas = filtered.reduce((acc, d) => acc + (d.Total_Overtime_Hours ?? 0), 0)

    const texto =
      filtered.length === data.length
        ? `${data.length} registro${data.length === 1 ? '' : 's'} · ${empleados} empleado${empleados === 1 ? '' : 's'}`
        : `${filtered.length} de ${data.length} registros`

    return { empleados, horas, texto }
  }, [filtered, data])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  const sinEntidades = !!companyCode && entidades.length === 0

  return (
    <>
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        {opcionesEntidad.length > 1 && (
          <AppSelect
            label="Entidad"
            value={entidad}
            options={opcionesEntidad}
            onValueChange={v => setEntidad(String(v))}
          />
        )}

        <SearchInput
          data={data}
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Category_Name', 'Solicitante']}
          onResults={setFiltered}
          placeholder="Buscar por empleado, correlativo o motivo"
        />

        {/* Barra de lote: aparece solo con tarjetas marcadas. Dice cuántas se
            van a firmar y cuántas quedan fuera, para que el conteo no
            sorprenda al confirmar. */}
        {seleccionados.size > 0 && (
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius={12}
            backgroundColor="$primaryOpacity2"
            borderWidth={1}
            borderColor="$primary"
          >
            <YStack flex={1} minWidth={0}>
              <Text fontSize={13} fontWeight="700" color="$text">
                {seleccionValida.length} seleccionada(s)
              </Text>
              <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                {fmtHoras(seleccionValida.reduce((a, d) => a + (d.Total_Overtime_Hours ?? 0), 0))}
                {bloqueadas > 0 ? ` · ${bloqueadas} sin acción disponible` : ''}
              </Text>
            </YStack>

            <Button
              height={36} borderRadius={10} paddingHorizontal="$3"
              backgroundColor="$backgroundSurface"
              borderWidth={1} borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              disabled={seleccionValida.length === 0}
              onPress={() => {
                setMotivo('')
                setMotivoError('')
                setRechazando(seleccionValida)
              }}
            >
              <X size={16} color={theme.error?.val as string} />
            </Button>

            <Button
              height={36} borderRadius={10} paddingHorizontal="$3"
              backgroundColor="$success"
              pressStyle={{ opacity: 0.85 }}
              disabled={seleccionValida.length === 0}
              onPress={() => abrirAprobacion(seleccionValida)}
            >
              <XStack alignItems="center" gap="$1.5">
                <Check size={16} color="white" />
                <Text fontSize={13} fontWeight="700" color="white">
                  Aprobar
                </Text>
              </XStack>
            </Button>
          </XStack>
        )}

        {/* Marcar o desmarcar lo que se está viendo, y cuánto hay */}
        {data.length > 0 && (
          <XStack alignItems="center" justifyContent="space-between" gap="$2" paddingVertical="$1">
            {filtered.length > 0 ? (
              <XStack
                alignItems="center"
                gap="$2"
                pressStyle={{ opacity: 0.6 }}
                onPress={seleccionarTodas}
              >
                <CheckSquare size={15} color={theme.textMuted?.val as string} />
                <Text fontSize={12} color="$textMuted">
                  {seleccionados.size > 0 ? 'Quitar selección' : 'Seleccionar todas'}
                </Text>
              </XStack>
            ) : (
              <View />
            )}

            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              {resumen.texto}
            </Text>
          </XStack>
        )}
      </YStack>

      <FlatList
        ref={listaRef}
        data={filtered}
        keyExtractor={item => String(item.Id)}
        onScrollToIndexFailed={info => {
          listaRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          })
          setTimeout(() => {
            listaRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 })
          }, 250)
        }}
        contentContainerStyle={
          filtered.length === 0
            ? { flexGrow: 1 }
            : { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[theme.primary?.val as string]}
            tintColor={theme.primary?.val as string}
          />
        }
        ListEmptyComponent={
          sinEntidades ? (
            <EmptyState
              title="Sin entidades asignadas"
              message="No participás en el flujo de aprobación de horas extra de esta empresa."
            />
          ) : (
            <EmptyState
              title="Nada pendiente"
              message="No hay solicitudes de horas extra esperando tu aprobación."
            />
          )
        }
        renderItem={({ item }) => (
          <SolicitudCard
            item={item}
            resaltada={item.Request_Id === resaltadaId}
            seleccionada={seleccionados.has(item.Id)}
            firmable={puedeAutorizar(item, nombreEntidad)}
            onSeleccionar={() => alternarSeleccion(item.Id)}
            onAprobar={() => abrirAprobacion([item])}
            onRechazar={() => {
              setMotivo('')
              setMotivoError('')
              setRechazando([item])
            }}
          />
        )}
      />

    </View>
      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) { setAprobando(null); setImpacto([]) } }}
        title="Aprobar horas extra"
        message={aprobando ? `¿Aprobar ${resumenLote(aprobando)}?` : ''}
        confirmLabel={aprobando && aprobando.length > 1 ? `Aprobar ${aprobando.length}` : 'Aprobar'}
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={() => aprobando && enviarDecision(aprobando, true, '')}
        onCancel={() => { setAprobando(null); setImpacto([]) }}
        extra={impacto.length > 0 ? <ImpactoPresupuesto filas={impacto} /> : undefined}
      />

      <Modal
        visible={!!rechazando}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRechazando(null)}
      >
        <ScrollView
          style={styles.backdrop}
          contentContainerStyle={[styles.backdropContent, { paddingBottom: 24 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
              <YStack flex={1}>
                <Text fontSize={17} fontWeight="700" color="$text" marginBottom="$1">
                  Motivo de rechazo
                </Text>
                <Text fontSize={13} color="$textMuted" marginBottom="$3">
                  {rechazando ? `Vas a rechazar ${resumenLote(rechazando)}. Indica por qué.` : ''}
                </Text>
              </YStack>

              <View
                padding="$2"
                marginTop={-8}
                marginRight={-8}
                borderRadius={999}
                pressStyle={{ opacity: 0.6 }}
                onPress={() => setRechazando(null)}
              >
                <X size={20} color={theme.textMuted?.val as string} />
              </View>
            </XStack>

            <AppInput
              label="Motivo"
              multiline
              minLines={4}
              placeholder="Ej: No corresponde al turno, horas no autorizadas..."
              value={motivo}
              onChangeText={(v: string) => { setMotivo(v); setMotivoError('') }}
              error={motivoError}
              style={{ height: 140 }}
              autoFocus
            />

            <XStack gap="$3" marginTop={16}>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$backgroundSurface"
                borderWidth={1} borderColor="$border"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setRechazando(null)}
              >
                <Text color="$text" fontWeight="600">Cancelar</Text>
              </Button>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$error"
                pressStyle={{ opacity: 0.8 }}
                disabled={enviando}
                onPress={confirmarRechazo}
              >
                <Text color="white" fontWeight="700">
                  {rechazando && rechazando.length > 1 ? `Rechazar ${rechazando.length}` : 'Rechazar'}
                </Text>
              </Button>
            </XStack>
          </View>
        </ScrollView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  modalCard: { borderRadius: 16, padding: 20 },
})

const fmtDinero = (valor: number | null | undefined): string =>
  `L ${Math.round(Number(valor ?? 0)).toLocaleString('es-HN')}`

/**
 * Lo que cuesta aprobar, por centro de costos y por empleado.
 *
 * Quien pone la última firma es el que compromete el dinero, y hasta ahora lo
 * hacía sin saber cuánto. El total va arriba y el desglose debajo, porque la
 * pregunta es primero "cuánto" y después "de quién".
 *
 * Solo llega acá con el acceso 'CostoHE': el filtro está en la consulta, así
 * que si el usuario no lo tiene el bloque ni se pide.
 */
function ImpactoPresupuesto({ filas }: { filas: IOvertimeApprovalImpact[] }) {
  return (
    <YStack gap="$2" width="100%">
      {filas.map(r => {
        const empleados: any[] = (() => {
          try {
            const parsed = JSON.parse(r.Empleados_Json ?? '[]')
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()

        return (
          <YStack
            key={r.Area_Codigo}
            width="100%"
            backgroundColor="$backgroundSurface"
            borderRadius={10}
            padding="$2.5"
            gap="$1.5"
          >
            {/* Sin este rótulo el monto se puede leer como "el presupuesto
                del área" en vez de "lo que cuesta esta firma", que es justo lo
                contrario de lo que hay que entender. */}
            <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
              COSTO DE APROBAR
            </Text>

            <XStack justifyContent="space-between" alignItems="flex-end" gap="$2">
              <Text fontSize={11} color="$textMuted" numberOfLines={1} flex={1}>
                {r.Area_Nombre || r.Area_Codigo}
              </Text>
              <Text fontSize={20} fontWeight="800" color="$text">
                {fmtDinero(r.Costo_Nuevo)}
              </Text>
            </XStack>

            {/* Un solo empleado ya está dicho en el mensaje del diálogo: el
                desglose solo aporta cuando hay varios. */}
            {empleados.length > 1 &&
              empleados.map((e, i) => (
                <XStack key={`${e?.employee_Code}-${i}`} justifyContent="space-between" gap="$2">
                  <Text fontSize={10} color="$textMuted" numberOfLines={1} flex={1}>
                    {nombreConCodigo(e?.employee_Name, e?.employee_Code)}
                  </Text>
                  <Text fontSize={10} color="$textSecondary" fontWeight="600">
                    {fmtHoras(e?.horas)} · {fmtDinero(e?.costo)}
                  </Text>
                </XStack>
              ))}
          </YStack>
        )
      })}
    </YStack>
  )
}

function SolicitudCard({
  item,
  resaltada,
  seleccionada,
  firmable = true,
  onSeleccionar,
  onAprobar,
  onRechazar,
}: {
  item: IOvertimeRequestDetail
  /** Llegó por notificación: se marca un momento para poder ubicarla. */
  resaltada?: boolean
  /** Marcada para resolver en lote. */
  seleccionada?: boolean
  /** A esta entidad todavía le toca firmarla. */
  firmable?: boolean
  onSeleccionar: () => void
  onAprobar: () => void
  onRechazar: () => void
}) {
  const theme = useTheme()
  const conceptos = useMemo(() => parseConceptos(item.ConceptsJson), [item.ConceptsJson])

  return (
    <Card
      backgroundColor={resaltada || seleccionada ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={14}
      padding="$3"
      // Seleccionada y resaltada comparten el borde naranja: son dos formas de
      // "esta es la que importa ahora", y distinguirlas con dos colores
      // obligaría a recordar cuál es cuál.
      borderWidth={resaltada || seleccionada ? 2 : 1}
      borderColor={resaltada || seleccionada ? '$primary' : '$border'}
    >
      <YStack gap="$3">
        {/* Quién y cuándo */}
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          {/* Casilla de selección. Solo en las que esta entidad puede firmar:
              marcar una que no se puede resolver solo llevaría a un lote que
              silenciosamente la deja fuera. */}
          {firmable && (
            <View
              paddingTop={2}
              paddingRight="$1"
              hitSlop={12}
              pressStyle={{ opacity: 0.6 }}
              onPress={onSeleccionar}
            >
              {seleccionada ? (
                <CheckSquare size={20} color={theme.primary?.val as string} />
              ) : (
                <Square size={20} color={theme.textMuted?.val as string} />
              )}
            </View>
          )}

          <YStack flex={1} gap="$1">
            <Text fontSize={15} fontWeight="700" color="$text" numberOfLines={2}>
              {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
            </Text>
            {!!item.Departamento && (
              <Text fontSize={12} color="$textMuted" numberOfLines={1}>
                {item.Departamento}
              </Text>
            )}
          </YStack>

          <XStack
            paddingHorizontal={8}
            paddingVertical={3}
            borderRadius={20}
            alignItems="center"
            gap="$1"
            // Transparente al resaltar, para que el naranja de la tarjeta no
            // quede recortado por los bloques grises de adentro.
            backgroundColor={resaltada ? 'transparent' : '$backgroundSurface'}
          >
            <CalendarDays size={11} color={theme.textMuted?.val as string} />
            <Text fontSize={11} fontWeight="600" color="$textSecondary">
              {fmtFecha(item.Date)}
            </Text>
          </XStack>
        </XStack>

        {/* Las horas: el dato que se está aprobando */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack alignItems="center" gap="$2">
            <Clock size={15} color={theme.textMuted?.val as string} />
            <Text fontSize={14} fontWeight="600" color="$text">
              {fmtHora(item.Start_Time)} — {fmtHora(item.End_Time)}
            </Text>
          </XStack>
          <Text fontSize={20} fontWeight="800" color="$text">
            {fmtHoras(item.Total_Overtime_Hours)}
          </Text>
        </XStack>

        <DistribucionHoras conceptos={conceptos} />

        {/* Quién las pide y por qué */}
        <YStack gap="$1" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          <XStack alignItems="center" gap="$2">
            <UserRound size={13} color={theme.textMuted?.val as string} />
            <Text fontSize={12} color="$textMuted" numberOfLines={1}>
              Solicita{' '}
              <Text fontSize={12} fontWeight="600" color="$textSecondary">
                {nombreConCodigo(item.Solicitante) || '—'}
              </Text>
            </Text>
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" gap="$2">
            <Text fontSize={12} color="$textMuted" numberOfLines={1} flex={1}>
              {item.Category_Name || 'Sin motivo'}
            </Text>
            <Text fontSize={11} fontWeight="600" color="$textMuted">
              {item.Correlative}
            </Text>
          </XStack>
        </YStack>

        {/* La decisión. Va al pie de la tarjeta, después de todo lo que hay que
            leer para tomarla. */}
        <XStack gap="$2">
          <Button
            flex={1} height={40} borderRadius={10}
            backgroundColor="$backgroundSurface"
            borderWidth={1} borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={onRechazar}
          >
            <XStack alignItems="center" gap="$2">
              <X size={15} color={theme.error?.val as string} />
              <Text fontSize={13} fontWeight="700" color="$error">Rechazar</Text>
            </XStack>
          </Button>

          <Button
            flex={1} height={40} borderRadius={10}
            backgroundColor="$success"
            pressStyle={{ opacity: 0.85 }}
            onPress={onAprobar}
          >
            <XStack alignItems="center" gap="$2">
              <Check size={15} color="white" />
              <Text fontSize={13} fontWeight="700" color="white">Aprobar</Text>
            </XStack>
          </Button>
        </XStack>
      </YStack>
    </Card>
  )
}
