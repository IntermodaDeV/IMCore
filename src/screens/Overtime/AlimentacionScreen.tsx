import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import Share from 'react-native-share'
import dayjs from 'dayjs'
import { YStack, XStack, Text, View, Card, Button, Spinner, useTheme } from 'tamagui'
import { Briefcase, Check, CheckCircle2, CheckSquare, Clock, Download, FileText, Mail, Plus, Square, UserRound, X, XCircle } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppSelect from '../../components/commons/AppSelect'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { useShowToast } from '../../utils/useShowToast'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import AppInput from '../../components/commons/AppInput'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import { IApproverLunch, ILunchesPdf, IPayWebWeek, IUserEntity } from '../../api/modules/overtime/overtime.types'
import { nombreConCodigo } from './Overtime.utils'

// ALIMENTACIÓN: los almuerzos de las HE de la gente del usuario, semana por
// semana, en una sola lista con su estado:
//   Pendiente  → falta la firma de alguna etapa (dice cuál).
//   Aprobado   → lo aprobó la última entidad (Autoriza Gerente): se otorga.
//   Rechazado  → una etapa lo quitó o la HE se rechazó.
// Entra lo que el usuario firmó y lo pendiente de los empleados de sus áreas.
//
// Solo consulta. De aquí sale la lista para cafetería: el PDF de los almuerzos
// APROBADOS de un día (con las firmas de jefe y gerente), que se descarga o se
// manda por correo a los destinatarios de AdmSys.ConfiguracionCorreos.
// Mismo diseño que la bandeja del jefe (SolicitudesHorasExtraScreen).

type Estado = 'Todos' | 'Pendiente' | 'Aprobado' | 'Rechazado'

const etiquetaSemana = (w: IPayWebWeek): string => {
  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''
  return `Sem ${w.WeekNumber} · ${corta(w.InitialDate)} - ${corta(w.FinalDate)}`
}

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`
const claveDia = (iso: string | null | undefined) => String(iso ?? '').substring(0, 10)

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

/** 'Mié 24' de un 'yyyy-mm-dd'. */
const etiquetaDia = (clave: string): string => {
  const [a, m, d] = clave.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(a, m - 1, d).getDay()]} ${d}`
}

export default function AlimentacionScreen() {
  const theme = useTheme()
  const navigation = useNavigation()
  const { defaultCompany } = useAuth()
  const companyCode = defaultCompany?.Code ?? ''

  // Crear almuerzos: entidad Solicitante de HE y el acceso 'SolicitarAlmuerzoHE'.
  // Aprobar: con la entidad elegida (jefe o gerente), como en la bandeja: con
  // varias se elige con cuál firmar. El servidor dice en qué etapa va cada
  // solicitud de almuerzo (Pending_Entity_Id).
  const [puedeCrear, setPuedeCrear] = useState(false)
  const [entidades, setEntidades] = useState<IUserEntity[]>([])
  const [entidad, setEntidad] = useState('')
  useEffect(() => {
    if (!companyCode) return
    Promise.all([
      overtimeService.getRequestorEntities(companyCode).catch(() => null),
      overtimeService.getRequestPermissions(companyCode).catch(() => null),
      overtimeService.getRequestEntities(companyCode).catch(() => null),
    ]).then(([ent, perm, firma]) => {
      setPuedeCrear(!!(ent?.Success && (ent.Data ?? []).length > 0 && perm?.Success && perm.Data?.Can_Request_Lunch))
      const lista = firma?.Success ? firma.Data ?? [] : []
      setEntidades(lista)
      // Al cambiar de empresa la entidad anterior puede ya no existir
      setEntidad(prev => (prev && lista.some(e => String(e.Id) === prev) ? prev : lista.length ? String(lista[0].Id) : ''))
    })
  }, [companyCode])

  const opcionesEntidad = useMemo(() => entidades.map(e => ({ label: e.Name, value: String(e.Id) })), [entidades])

  /** La lista para cafetería (PDF y correo) la manda el jefe: la etapa 1 del flujo, con la entidad elegida. */
  const esJefe = useMemo(() => entidades.find(e => String(e.Id) === entidad)?.Order === 1, [entidades, entidad])

  /** Solicitud de almuerzo pendiente que le toca firmar a la entidad elegida. */
  const puedeDecidir = useCallback(
    (item: IApproverLunch) =>
      !!entidad && !!item.Is_Meal && item.Status === 'Pendiente' && !item.Is_Draft
      && String(item.Pending_Entity_Id ?? '') === entidad,
    [entidad],
  )

  // Las marcadas para aprobar o rechazar en lote (por detalle de HE)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // Aprobar o rechazar solicitudes de almuerzo, aquí mismo (una o varias)
  const [aprobando, setAprobando] = useState<IApproverLunch[] | null>(null)
  const [rechazando, setRechazando] = useState<IApproverLunch[] | null>(null)
  const [motivo, setMotivo] = useState('')
  const [decidiendo, setDecidiendo] = useState(false)

  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState('')
  // La semana elegida, siempre al día: al refrescar se queda en ella (del estado
  // la recarga leía la del primer render y volvía a la semana actual)
  const semanaRef = useRef('')
  semanaRef.current = semana
  const [data, setData] = useState<IApproverLunch[]>([])
  const [filtered, setFiltered] = useState<IApproverLunch[]>([])
  const [dia, setDia] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado>('Todos')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const { showToast } = useShowToast()

  // Lista para cafetería: elegir día → generar → descargar o enviar
  const [pdfAbierto, setPdfAbierto] = useState(false)
  const [diaPdf, setDiaPdf] = useState<string | null>(null)
  const [pdf, setPdf] = useState<ILunchesPdf | null>(null)
  const [generando, setGenerando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Módulo de cada almuerzo (por detalle de HE): llega después, del cubo
  const [modulos, setModulos] = useState<Map<number, string>>(new Map())

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Almuerzos
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  // Al volver de crear una alimentación se recarga (la primera vez ya cargó el useEffect)
  const yaEnfocada = useRef(false)
  const recargarRef = useRef<() => void>(() => {})
  useFocusEffect(
    useCallback(() => {
      if (yaEnfocada.current) recargarRef.current()
      yaEnfocada.current = true
    }, []),
  )

  const opcionesSemana = useMemo(
    () => [...semanas].reverse().map(w => ({ label: etiquetaSemana(w), value: claveSemana(w) })),
    [semanas],
  )

  const cargarSemana = useCallback(
    async (w: IPayWebWeek | null) => {
      if (!companyCode || !w?.InitialDate || !w?.FinalDate) {
        setData([])
        setFiltered([])
        return
      }
      const res = await overtimeService.getApproverLunches(
        companyCode,
        w.InitialDate.substring(0, 10),
        w.FinalDate.substring(0, 10),
      )
      if (!res?.Success) {
        throw new Error(res?.ErrorMessage || 'No se pudieron cargar los almuerzos de la semana.')
      }
      const lista = res.Data ?? []
      setData(lista)
      setFiltered(lista)

      // El módulo va aparte y no tumba la pantalla si falla
      const ids = lista.map(f => f.RequestDetails_Id)
      if (ids.length > 0) {
        overtimeService.getDetailModules(companyCode, ids)
          .then(m => {
            if (m?.Success) setModulos(new Map((m.Data ?? []).filter(x => !!x.Modulo).map(x => [x.Id, x.Modulo as string])))
          })
          .catch(() => {})
      } else {
        setModulos(new Map())
      }
    },
    [companyCode],
  )

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (!companyCode) return
      if (isRefresh) setRefreshing(true)
      setError(null)
      try {
        const res = await overtimeService.getCalendarWeeks(companyCode)
        if (!res?.Success) {
          throw new Error(res?.ErrorMessage || 'No se pudo cargar el calendario de semanas.')
        }
        const lista = res.Data ?? []
        setSemanas(lista)

        const previa = lista.find(w => claveSemana(w) === semanaRef.current)
        const elegida = previa ?? lista.find(w => w.IsCurrentWeek) ?? lista[lista.length - 1] ?? null
        setSemana(elegida ? claveSemana(elegida) : '')

        await cargarSemana(elegida)
      } catch (err) {
        setError(handleError(err))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
      // La semana elegida se lee de semanaRef: al refrescar se queda en la que está.
    },
    [companyCode, cargarSemana],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  recargarRef.current = () => loadData(true)

  const cambiarSemana = useCallback(
    async (clave: string) => {
      setSemana(clave)
      setDia(null)
      const w = semanas.find(x => claveSemana(x) === clave) ?? null
      setRefreshing(true)
      try {
        await cargarSemana(w)
      } catch (err) {
        setError(handleError(err))
      } finally {
        setRefreshing(false)
      }
    },
    [semanas, cargarSemana],
  )

  // Solo los días que tienen almuerzos, en orden.
  const dias = useMemo(() => {
    const claves = [...new Set(data.map(f => claveDia(f.Date)).filter(Boolean))].sort()
    return claves.map(k => ({ key: k, label: etiquetaDia(k) }))
  }, [data])

  // Buscador → día → estado. Los conteos de estado son del día elegido.
  const delDia = useMemo(
    () => (dia ? filtered.filter(f => claveDia(f.Date) === dia) : filtered),
    [filtered, dia],
  )

  const conteo = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of delDia) c[f.Status ?? ''] = (c[f.Status ?? ''] ?? 0) + 1
    return c
  }, [delDia])

  // Las pendientes primero; dentro de cada grupo se respeta el orden que trae el servidor
  const visibles = useMemo(() => {
    const lista = estado === 'Todos' ? delDia : delDia.filter(f => f.Status === estado)
    return [...lista].sort((a, b) => Number(b.Status === 'Pendiente') - Number(a.Status === 'Pendiente'))
  }, [delDia, estado])

  // Marcadas que siguen siendo de esta entidad (al cambiar de entidad o recargar, lo demás se ignora)
  const seleccionValida = useMemo(
    () => data.filter(f => seleccionados.has(f.RequestDetails_Id) && puedeDecidir(f)),
    [data, seleccionados, puedeDecidir],
  )
  const marcables = useMemo(() => visibles.filter(puedeDecidir), [visibles, puedeDecidir])

  const alternarSeleccion = useCallback((id: number) => {
    setSeleccionados(prev => {
      const copia = new Set(prev)
      copia.has(id) ? copia.delete(id) : copia.add(id)
      return copia
    })
  }, [])

  /** Marca o desmarca las que se están viendo y le tocan a esta entidad. */
  const seleccionarTodas = useCallback(() => {
    const ids = marcables.map(f => f.RequestDetails_Id)
    const todas = ids.length > 0 && ids.every(id => seleccionados.has(id))
    setSeleccionados(prev => {
      const copia = new Set(prev)
      ids.forEach(id => (todas ? copia.delete(id) : copia.add(id)))
      return copia
    })
  }, [marcables, seleccionados])

  // Días con almuerzos APROBADOS: solo de esos sale la lista para cafetería
  const diasAprobados = useMemo(() => {
    const c = new Map<string, number>()
    for (const f of data) if (f.Status === 'Aprobado') c.set(claveDia(f.Date), (c.get(claveDia(f.Date)) ?? 0) + 1)
    return [...c.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, n]) => ({ key, n }))
  }, [data])

  const abrirPdf = () => {
    setPdf(null)
    setDiaPdf(dia && diasAprobados.some(d => d.key === dia) ? dia : diasAprobados[0]?.key ?? null)
    setPdfAbierto(true)
  }

  const cerrarPdf = () => {
    if (generando || enviando) return
    setPdfAbierto(false)
    setPdf(null)
  }

  const generarPdf = async () => {
    if (!diaPdf || generando) return
    setGenerando(true)
    try {
      const res = await overtimeService.getLunchesPdf(companyCode, diaPdf)
      if (!res?.Success || !res.Data) {
        showToast('error', 'Error', res?.ErrorMessage || 'No se pudo generar el PDF', 5000, 'top')
        return
      }
      setPdf(res.Data)
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setGenerando(false)
    }
  }

  const descargarPdf = async () => {
    if (!pdf) return
    try {
      await Share.open({
        title: 'Lista de almuerzos',
        url: `data:application/pdf;base64,${pdf.Base64}`,
        type: 'application/pdf',
        filename: pdf.FileName.replace(/\.pdf$/i, ''),
        failOnCancel: false,
      })
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    }
  }

  const enviarPdf = async () => {
    if (!pdf || enviando) return
    setEnviando(true)
    try {
      const res = await overtimeService.sendLunchesPdf(companyCode, pdf.Date)
      if (!res?.Success) {
        showToast('error', 'Error', res?.ErrorMessage || 'No se pudo enviar el correo', 5000, 'top')
        return
      }
      showToast('success', 'Correo enviado', res.SuccessMessage || 'Lista enviada', 4000, 'top')
      setPdfAbierto(false)
      setPdf(null)
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setEnviando(false)
    }
  }

  /** Firma las solicitudes de almuerzo con la entidad elegida (la misma ruta que la bandeja: avisa igual). */
  const decidir = async (items: IApproverLunch[], aprobar: boolean, comentario: string) => {
    if (decidiendo || !entidad || items.length === 0) return
    setDecidiendo(true)
    try {
      const res = await overtimeService.authorizeRequest(companyCode, {
        SystemEntities_Id: Number(entidad),
        Auth: aprobar,
        Comment: comentario,
        Details: items.map(i => i.RequestDetails_Id),
        Lunches: aprobar ? items.map(i => ({ RequestDetails_Id: i.RequestDetails_Id, Granted: true })) : [],
      })
      if (!res?.Success) {
        showToast('error', 'Error', res?.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
        return
      }
      const n = items.length
      showToast(
        'success',
        aprobar ? (n > 1 ? `${n} almuerzos aprobados` : 'Almuerzo aprobado') : (n > 1 ? `${n} almuerzos rechazados` : 'Almuerzo rechazado'),
        res.SuccessMessage || '', 3000, 'top',
      )
      setAprobando(null)
      setRechazando(null)
      setSeleccionados(new Set())
      loadData(true)
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setDecidiendo(false)
    }
  }

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={() => loadData()} />

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$1">
        {/* Con varias entidades se elige con cuál firmar, como en la bandeja */}
        {opcionesEntidad.length > 1 && (
          <AppSelect
            label="Entidad"
            value={entidad}
            options={opcionesEntidad}
            onValueChange={v => { setEntidad(String(v)); setSeleccionados(new Set()) }}
          />
        )}

        {/* La semana y, a la par, el PDF para cafetería (solo con aprobados).
            Alineados abajo: el botón queda a la altura del campo, no de la etiqueta. */}
        <XStack alignItems="flex-end" gap="$2">
          <YStack flex={1} minWidth={0}>
            <AppSelect
              label="Semana"
              value={semana}
              options={opcionesSemana}
              onValueChange={v => cambiarSemana(String(v))}
              placeholder={semanas.length === 0 ? 'Sin semanas' : ''}
              disabled={semanas.length === 0}
            />
          </YStack>
          {puedeCrear && (
            <Button
              height={44}
              marginBottom="$2"
              width={44}
              padding={0}
              borderRadius="$3"
              backgroundColor="$primary"
              pressStyle={{ opacity: 0.85 }}
              onPress={() => (navigation as any).navigate('crearAlimentacionHE')}
              accessibilityLabel="Nueva alimentación"
            >
              <Plus size={20} color="white" />
            </Button>
          )}
          {esJefe && diasAprobados.length > 0 && (
            <Button
              // Mismo alto (44) y margen de abajo ($2) que el campo de AppSelect
              height={44}
              marginBottom="$2"
              borderRadius="$3"
              paddingHorizontal="$3"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              onPress={abrirPdf}
              accessibilityLabel="PDF de almuerzos para cafetería"
            >
              <XStack alignItems="center" gap="$1.5">
                <FileText size={17} color={theme.primary?.val as string} />
                <Text fontSize={13} fontWeight="700" color="$primary">PDF</Text>
              </XStack>
            </Button>
          )}
        </XStack>

        <SearchInput
          data={data}
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Reason_Name', 'Requester_Name']}
          onResults={setFiltered}
          placeholder="Buscar por empleado, correlativo o motivo"
        />

        {/* Los días que tienen almuerzos. Con uno solo no separa nada. */}
        {dias.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            <ChipFiltro label="Todos" activo={!dia} onPress={() => setDia(null)} />
            {dias.map(d => (
              <ChipFiltro
                key={d.key}
                label={d.label}
                activo={dia === d.key}
                onPress={() => setDia(dia === d.key ? null : d.key)}
              />
            ))}
          </ScrollView>
        )}

        {/* Estado, con cuántos hay de cada uno. */}
        {data.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            <ChipFiltro label={`Todos · ${delDia.length}`} activo={estado === 'Todos'} onPress={() => setEstado('Todos')} />
            <ChipFiltro label={`Pendientes · ${conteo['Pendiente'] ?? 0}`} activo={estado === 'Pendiente'} onPress={() => setEstado('Pendiente')} />
            <ChipFiltro label={`Aprobados · ${conteo['Aprobado'] ?? 0}`} activo={estado === 'Aprobado'} onPress={() => setEstado('Aprobado')} />
            <ChipFiltro label={`Rechazados · ${conteo['Rechazado'] ?? 0}`} activo={estado === 'Rechazado'} onPress={() => setEstado('Rechazado')} />
          </ScrollView>
        )}

        {/* Las marcadas: cuántas y las acciones en lote (mismo formato que la bandeja) */}
        {seleccionValida.length > 0 && (
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
            <Text flex={1} fontSize={13} fontWeight="700" color="$text">
              {seleccionValida.length} seleccionada(s)
            </Text>
            <Button
              height={36} borderRadius={10} paddingHorizontal="$3"
              backgroundColor="$backgroundSurface"
              borderWidth={1} borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              accessibilityLabel="Rechazar las seleccionadas"
              onPress={() => { setMotivo(''); setRechazando(seleccionValida) }}
            >
              <X size={16} color={theme.error?.val as string} />
            </Button>
            <Button
              height={36} borderRadius={10} paddingHorizontal="$3"
              backgroundColor="$success"
              pressStyle={{ opacity: 0.85 }}
              accessibilityLabel="Aprobar las seleccionadas"
              onPress={() => setAprobando(seleccionValida)}
            >
              <Check size={16} color="white" />
            </Button>
          </XStack>
        )}

        {/* Marcar o desmarcar las que le tocan a esta entidad */}
        {marcables.length > 0 && (
          <XStack alignItems="center" gap="$2" paddingVertical="$1" pressStyle={{ opacity: 0.6 }} onPress={seleccionarTodas}>
            <CheckSquare size={15} color={theme.textMuted?.val as string} />
            <Text fontSize={12} color="$textMuted">
              {marcables.every(f => seleccionados.has(f.RequestDetails_Id)) ? 'Quitar selección' : `Seleccionar todas (${marcables.length})`}
            </Text>
          </XStack>
        )}
      </YStack>

      <FlatList
        data={visibles}
        keyExtractor={f => String(f.Id)}
        contentContainerStyle={
          visibles.length === 0
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
          data.length === 0 ? (
            <EmptyState
              title="Sin almuerzos"
              message="No hay horas extra con almuerzo de tu gente en esta semana."
            />
          ) : (
            <EmptyState
              title="Sin resultados"
              message='No hay almuerzos con ese filtro. Toque "Todos" para ver el resto.'
            />
          )
        }
        renderItem={({ item }) => (
          <AlmuerzoCard
            item={item}
            modulo={modulos.get(item.RequestDetails_Id)}
            // Solo la solicitud de almuerzo se aprueba aquí; el almuerzo de una HE
            // de descanso va con su HE en la bandeja
            puedeDecidir={puedeDecidir(item)}
            seleccionada={seleccionados.has(item.RequestDetails_Id)}
            // Con algo marcado se decide desde la barra: sin botones por tarjeta
            sinAcciones={seleccionValida.length > 0}
            onSeleccionar={() => alternarSeleccion(item.RequestDetails_Id)}
            onAprobar={() => setAprobando([item])}
            onRechazar={() => { setMotivo(''); setRechazando([item]) }}
          />
        )}
      />

      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) setAprobando(null) }}
        title={aprobando && aprobando.length > 1 ? 'Aprobar almuerzos' : 'Aprobar almuerzo'}
        message={aprobando
          ? aprobando.length > 1
            ? `¿Aprobar los ${aprobando.length} almuerzos seleccionados?`
            : `¿Aprobar el almuerzo de ${nombreConCodigo(aprobando[0].Employee_Name ?? '', aprobando[0].Employee_Code ?? undefined)}?`
          : ''}
        confirmLabel="Aprobar"
        confirmColor="#22C55E"
        loading={decidiendo}
        onConfirm={() => aprobando && decidir(aprobando, true, '')}
        onCancel={() => setAprobando(null)}
      />

      <Modal visible={!!rechazando} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRechazando(null)}>
        <ScrollView style={styles.backdrop} contentContainerStyle={styles.backdropContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}>
            <Text fontSize={17} fontWeight="700" color="$text" marginBottom="$1">
              {rechazando && rechazando.length > 1 ? 'Rechazar almuerzos' : 'Rechazar almuerzo'}
            </Text>
            <Text fontSize={13} color="$textMuted" marginBottom="$3">
              {rechazando
                ? rechazando.length > 1
                  ? `Vas a rechazar ${rechazando.length} almuerzos. Indica por qué.`
                  : `Vas a rechazar el almuerzo de ${nombreConCodigo(rechazando[0].Employee_Name ?? '', rechazando[0].Employee_Code ?? undefined)}. Indica por qué.`
                : ''}
            </Text>
            <AppInput label="Motivo" multiline minLines={3} value={motivo} onChangeText={setMotivo} maxLength={500} />
            <XStack gap="$2" marginTop="$3">
              <Button flex={1} height={42} borderRadius={10} backgroundColor="$backgroundSurface" borderWidth={1} borderColor="$border"
                pressStyle={{ opacity: 0.7 }} onPress={() => setRechazando(null)}>
                <Text fontSize={13} fontWeight="700" color="$text">Cancelar</Text>
              </Button>
              <Button flex={1} height={42} borderRadius={10} backgroundColor="$error" pressStyle={{ opacity: 0.85 }}
                disabled={decidiendo || motivo.trim().length < 3} opacity={motivo.trim().length < 3 ? 0.5 : 1}
                onPress={() => rechazando && decidir(rechazando, false, motivo.trim())}>
                <Text fontSize={13} fontWeight="700" color="white">{decidiendo ? 'Rechazando…' : 'Rechazar'}</Text>
              </Button>
            </XStack>
          </View>
        </ScrollView>
      </Modal>

      {/* Lista para cafetería: elegir el día, generar, y descargar o enviar */}
      <Modal visible={pdfAbierto} transparent animationType="fade" statusBarTranslucent onRequestClose={cerrarPdf}>
        <ScrollView style={styles.backdrop} contentContainerStyle={styles.backdropContent}>
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
              <YStack flex={1}>
                <Text fontSize={17} fontWeight="700" color="$text" marginBottom="$1">
                  Almuerzos para cafetería
                </Text>
                <Text fontSize={13} color="$textMuted" marginBottom="$3">
                  {pdf
                    ? `${pdf.Count} almuerzo(s) aprobado(s) del ${etiquetaDiaLarga(pdf.Date)}.`
                    : 'Elige el día: la lista lleva los almuerzos aprobados de ese día.'}
                </Text>
              </YStack>
              <View padding="$2" marginTop={-8} marginRight={-8} borderRadius={999} pressStyle={{ opacity: 0.6 }} onPress={cerrarPdf}>
                <X size={20} color={theme.textMuted?.val as string} />
              </View>
            </XStack>

            {!pdf ? (
              <YStack gap="$3">
                <XStack gap={6} flexWrap="wrap">
                  {diasAprobados.map(d => (
                    <ChipFiltro
                      key={d.key}
                      label={`${etiquetaDia(d.key)} · ${d.n}`}
                      activo={diaPdf === d.key}
                      onPress={() => setDiaPdf(d.key)}
                    />
                  ))}
                </XStack>

                <Button
                  height={42} borderRadius={10}
                  backgroundColor="$primary"
                  pressStyle={{ opacity: 0.85 }}
                  disabled={!diaPdf || generando}
                  opacity={!diaPdf ? 0.5 : 1}
                  onPress={generarPdf}
                >
                  <XStack alignItems="center" gap="$2">
                    {generando ? <Spinner size="small" color="white" /> : <FileText size={16} color="white" />}
                    <Text fontSize={14} fontWeight="700" color="white">
                      {generando ? 'Generando…' : 'Generar PDF'}
                    </Text>
                  </XStack>
                </Button>
              </YStack>
            ) : (
              <YStack gap="$3">
                {/* Vista previa: las páginas tal cual se mandan */}
                <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
                  {pdf.Pages.map((p, i) => (
                    <Image
                      key={i}
                      source={{ uri: `data:image/png;base64,${p}` }}
                      style={{ width: '100%', aspectRatio: 8.5 / 11, borderRadius: 6, borderWidth: 1, borderColor: theme.border?.val as string, backgroundColor: 'white' }}
                      resizeMode="contain"
                    />
                  ))}
                </ScrollView>

                {/* A quién se manda: se ve antes de apretar */}
                <Text fontSize={11} color="$textMuted">
                  Para: {pdf.To.length ? pdf.To.join(', ') : 'sin destinatarios configurados'}
                </Text>

                <XStack gap="$2">
                  <Button
                    flex={1} height={42} borderRadius={10}
                    backgroundColor="$backgroundSurface" borderWidth={1} borderColor="$border"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={descargarPdf}
                  >
                    <XStack alignItems="center" gap="$1.5">
                      <Download size={16} color={theme.text?.val as string} />
                      <Text fontSize={13} fontWeight="700" color="$text">Descargar</Text>
                    </XStack>
                  </Button>
                  <Button
                    flex={1} height={42} borderRadius={10}
                    backgroundColor="$success"
                    pressStyle={{ opacity: 0.85 }}
                    disabled={enviando || pdf.To.length === 0}
                    opacity={pdf.To.length === 0 ? 0.5 : 1}
                    onPress={enviarPdf}
                  >
                    <XStack alignItems="center" gap="$1.5">
                      {enviando ? <Spinner size="small" color="white" /> : <Mail size={16} color="white" />}
                      <Text fontSize={13} fontWeight="700" color="white">{enviando ? 'Enviando…' : 'Enviar correo'}</Text>
                    </XStack>
                  </Button>
                </XStack>

                <Text fontSize={11} color="$primary" textAlign="center" pressStyle={{ opacity: 0.6 }} onPress={() => setPdf(null)}>
                  Elegir otro día
                </Text>
              </YStack>
            )}
          </View>
        </ScrollView>
      </Modal>
    </View>
  )
}

/** 'sábado 24 de octubre' de un 'yyyy-mm-dd'. */
const etiquetaDiaLarga = (clave: string): string => {
  const d = dayjs(clave)
  if (!d.isValid()) return clave
  const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${NOMBRES[d.day()]} ${d.date()} de ${MESES_L[d.month()]}`
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  modalCard: { borderRadius: 16, padding: 20 },
})

/** Un almuerzo: el día, el empleado, su módulo, el motivo, quién lo pidió y en qué va. */
function AlmuerzoCard({
  item,
  modulo,
  puedeDecidir = false,
  seleccionada = false,
  sinAcciones = false,
  onSeleccionar,
  onAprobar,
  onRechazar,
}: {
  item: IApproverLunch
  modulo?: string
  /** A esta entidad le toca firmar esta solicitud de almuerzo. */
  puedeDecidir?: boolean
  /** Marcada para aprobar o rechazar en lote. */
  seleccionada?: boolean
  /** Hay selección en lote: los botones de la tarjeta no se muestran. */
  sinAcciones?: boolean
  onSeleccionar?: () => void
  onAprobar?: () => void
  onRechazar?: () => void
}) {
  const theme = useTheme()
  const muted = theme.textMuted?.val as string
  const d = dayjs(item.Date)

  const tono =
    item.Status === 'Aprobado'
      ? { color: theme.success?.val as string, Icono: CheckCircle2, texto: 'Aprobado', detalle: '' }
      : item.Status === 'Rechazado'
        ? { color: theme.error?.val as string, Icono: XCircle, texto: 'Rechazado', detalle: item.Status_Detail ?? '' }
        : {
            color: theme.warning?.val as string,
            Icono: Clock,
            texto: 'Pendiente',
            detalle: item.Pending_Entity ? `Falta: ${item.Pending_Entity}` : (item.Status_Detail ?? ''),
          }

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={16}
      padding={0}
      overflow="hidden"
      borderWidth={1}
      borderColor={seleccionada ? '$primary' : '$border'}
      // La tarjeta que le toca firmar se marca con un toque, como en la bandeja
      pressStyle={puedeDecidir ? { opacity: 0.85 } : undefined}
      onPress={puedeDecidir ? onSeleccionar : undefined}
    >
      <XStack>
        {/* ── El DÍA: un bloque de calendario a la izquierda. */}
        <YStack
          width={62}
          alignItems="center"
          justifyContent="center"
          paddingVertical="$3"
          gap={1}
          backgroundColor="$backgroundSurface"
          borderRightWidth={1}
          borderRightColor="$border"
        >
          <Text fontSize={10} fontWeight="800" color="$textSecondary" letterSpacing={0.6}>
            {d.isValid() ? DIAS[d.day()] : ''}
          </Text>
          <Text fontSize={24} fontWeight="900" color="$text" lineHeight={26}>
            {d.isValid() ? d.format('DD') : '—'}
          </Text>
          <Text fontSize={9} fontWeight="700" color="$textMuted" letterSpacing={0.6}>
            {d.isValid() ? MESES[d.month()] : ''}
          </Text>
          {puedeDecidir && (
            <View marginTop={4}>
              {seleccionada ? (
                <CheckSquare size={15} color={theme.primary?.val as string} />
              ) : (
                <Square size={15} color={muted} />
              )}
            </View>
          )}
        </YStack>

        <YStack flex={1} padding="$2.5" gap="$1.5" minWidth={0}>
          <Text fontSize={13} fontWeight="800" color="$text" lineHeight={17}>
            {nombreConCodigo(item.Employee_Name ?? '', item.Employee_Code ?? undefined)}
          </Text>

          <XStack alignItems="center" gap="$1.5">
            <Briefcase size={10} color={muted} />
            <Text fontSize={10} fontWeight="700" color="$textSecondary" numberOfLines={1} flex={1}>
              {modulo || 'Sin módulo'}
            </Text>
          </XStack>

          <YStack gap={2} paddingTop="$1.5" borderTopWidth={1} borderTopColor="$border">
            <Text fontSize={10} color="$textSecondary" numberOfLines={2}>
              {(item.Reason_Name ?? '').trim() || 'Sin motivo'}
            </Text>
            <XStack alignItems="center" gap="$1.5">
              <UserRound size={10} color={muted} />
              <Text fontSize={10} color="$textMuted" numberOfLines={1} flex={1}>
                {item.Requester_Name ? nombreConCodigo(item.Requester_Name) : '—'}
              </Text>
            </XStack>
          </YStack>
        </YStack>
      </XStack>

      {/* ── En qué va. */}
      <XStack
        alignItems="center"
        gap="$1.5"
        paddingHorizontal="$2.5"
        paddingVertical="$2"
        borderTopWidth={1}
        borderTopColor="$border"
        style={{ backgroundColor: `${tono.color}14` }}
      >
        <tono.Icono size={13} color={tono.color} />
        <Text fontSize={12} fontWeight="800" style={{ color: tono.color }}>
          {tono.texto}
        </Text>
        <Text fontSize={10} color="$textMuted" numberOfLines={1} flex={1}>
          {tono.detalle}
        </Text>
      </XStack>

      {/* ── Las ACCIONES, como en la bandeja: solo a quien le toca firmar. */}
      {puedeDecidir && !sinAcciones && (
        <XStack gap="$2" padding="$2.5" paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
          <Button
            flex={1} height={36} borderRadius={10} paddingHorizontal="$1"
            backgroundColor="$backgroundSurface"
            borderWidth={1} borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={onRechazar}
          >
            <XStack alignItems="center" gap="$1">
              <X size={14} color={theme.error?.val as string} />
              <Text fontSize={12} fontWeight="700" color="$error">Rechazar</Text>
            </XStack>
          </Button>
          <Button
            flex={1} height={36} borderRadius={10} paddingHorizontal="$1"
            backgroundColor="$success"
            pressStyle={{ opacity: 0.85 }}
            onPress={onAprobar}
          >
            <XStack alignItems="center" gap="$1">
              <Check size={14} color="white" />
              <Text fontSize={12} fontWeight="700" color="white">Aprobar</Text>
            </XStack>
          </Button>
        </XStack>
      )}
    </Card>
  )
}

function ChipFiltro({ label, activo, onPress }: { label: string; activo: boolean; onPress: () => void }) {
  return (
    <View
      paddingHorizontal="$2"
      paddingVertical={5}
      borderRadius={999}
      borderWidth={1}
      borderColor={activo ? '$primary' : '$border'}
      backgroundColor={activo ? '$primaryOpacity2' : '$backgroundElevated'}
      pressStyle={{ opacity: 0.6 }}
      onPress={onPress}
    >
      <Text fontSize={10} fontWeight="700" color={activo ? '$primary' : '$textMuted'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
