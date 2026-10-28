import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { SectionList } from 'react-native'
import { YStack, XStack, Text, View, Button, Spinner, styled, useTheme } from 'tamagui'
import { ArrowLeft, Check, CheckSquare, ChevronDown, ChevronRight, Square, Utensils } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppDatePicker from '../../components/commons/AppDatePicker'
import AppInput from '../../components/commons/AppInput'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import { IMealEligibility, IOvertimeEmployee, ISaveOvertimeDetail, IUserEntity } from '../../api/modules/overtime/overtime.types'
import { nombreConCodigo } from './Overtime.utils'

/** Un empleado con de dónde viene: a cargo o prestado (otros empleados). */
type Empleado = IOvertimeEmployee & { Propio: boolean }

// NUEVO ALMUERZO: para el empleado que no sale a almorzar. Se eligen el día
// y los empleados (a cargo y prestados) y nada más: el servidor crea por cada
// uno una HE de 0.5 h en el almuerzo de su turno, que pasa por el mismo flujo
// de la HE (solicitante, jefe, gerente) y sale en la lista para cafetería.
//
// Solo en un día con jornada: si es feriado o descanso para el turno de alguno,
// el servidor lo rechaza y dice para quién.

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/** Sábado o domingo: ese día el almuerzo va dentro de la HE ('Otorgar almuerzo'), no aquí. */
const esFinDeSemana = (iso: string): boolean => {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay()
  return dia === 0 || dia === 6
}

/** Hoy; si cae en fin de semana, el lunes siguiente. */
const hoyISO = (): string => {
  const d = new Date()
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CrearAlimentacionScreen() {
  const theme = useTheme()
  const navigation = useNavigation()
  const { defaultCompany } = useAuth()
  const companyCode = defaultCompany?.Code ?? ''
  const { showToast } = useShowToast()

  const [entidad, setEntidad] = useState<IUserEntity | null>(null)
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [filtrados, setFiltrados] = useState<Empleado[]>([])
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [fecha, setFecha] = useState<string>(hoyISO())
  const [autorizar, setAutorizar] = useState(true)
  // Grupos abiertos (llave del grupo). De entrada solo 'Mis empleados a cargo'.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set(['propios']))
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  // Quién califica ese día (lo dice el servidor): los que no, deshabilitados con el motivo
  const [califica, setCalifica] = useState<Map<string, IMealEligibility>>(new Map())
  const [validando, setValidando] = useState(false)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Nuevo almuerzo
      </Text>
    ),
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
        <ArrowLeftStyled />
      </View>
    ),
  })

  const cargar = useCallback(async () => {
    if (!companyCode) return
    setError(null)
    try {
      const [ent, propios, otros] = await Promise.all([
        overtimeService.getRequestorEntities(companyCode),
        overtimeService.getEmployeesInCharge(companyCode),
        // Sin el acceso 'OtrosEmpleados' viene vacío: no tumba la pantalla
        overtimeService.getOtherEmployees(companyCode).catch(() => null),
      ])
      if (!ent?.Success) throw new Error(ent?.ErrorMessage || 'No se pudo cargar tu entidad de solicitante.')
      if (!propios?.Success) throw new Error(propios?.ErrorMessage || 'No se pudo cargar tu personal a cargo.')

      setEntidad((ent.Data ?? [])[0] ?? null)

      // A cargo primero y luego los prestados, sin repetir
      const vistos = new Set<string>()
      const lista: Empleado[] = [
        ...(propios.Data ?? []).map(e => ({ ...e, Propio: true })),
        ...(otros?.Success ? otros.Data ?? [] : []).map(e => ({ ...e, Propio: false })),
      ].filter(e => {
        const k = (e.Employee_Code ?? '').trim()
        if (!k || vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      setEmpleados(lista)
      setFiltrados(lista)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
    }
  }, [companyCode])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al elegir el día (o al cargar la gente) se valida a todos de una vez. Hasta que el
  // servidor responde POR ESA FECHA nadie se puede elegir: cada uno califica según su
  // turno (un feriado puede serlo para un turno y no para otro) y eso lo dice el servidor.
  const [validadoPara, setValidadoPara] = useState<string | null>(null)
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null)
  useEffect(() => {
    if (!companyCode || !fecha || empleados.length === 0) return
    let vigente = true
    setValidando(true)
    setValidadoPara(null)
    setErrorValidacion(null)
    setCalifica(new Map())
    overtimeService
      .getMealEligibility(companyCode, fecha, empleados.map(e => e.Employee_Code))
      .then(res => {
        if (!vigente) return
        if (!res?.Success) {
          setErrorValidacion(res?.ErrorMessage || 'No se pudo revisar quién califica ese día.')
          return
        }
        const mapa = new Map((res.Data ?? []).map(x => [x.Employee_Code.trim(), x]))
        setCalifica(mapa)
        setValidadoPara(fecha)
        // Lo elegido que no califica ese día (o que el servidor no devolvió) se suelta
        setElegidos(prev => new Set([...prev].filter(c => mapa.get(c.trim())?.Eligible === true)))
      })
      .catch(err => vigente && setErrorValidacion(handleError(err)?.message || 'No se pudo revisar quién califica ese día.'))
      .finally(() => vigente && setValidando(false))
    return () => {
      vigente = false
    }
  }, [companyCode, fecha, empleados])

  /**
   * Ese día nadie tiene almuerzo de turno (feriado o descanso entre semana): lo dice
   * el servidor (GetMealEligibility sin Lunch_Start para todos), la pantalla solo avisa.
   */
  const diaSinAlmuerzo = useMemo(
    () => califica.size > 0 && [...califica.values()].every(x => !x.Lunch_Start),
    [califica],
  )

  /** No se puede elegir: el servidor no ha respondido por esta fecha, o dijo que no califica. */
  const noCalifica = useCallback(
    (code: string) => validadoPara !== fecha || califica.get(code.trim())?.Eligible !== true,
    [califica, validadoPara, fecha],
  )

  const alternar = (code: string) =>
    !noCalifica(code) &&
    setElegidos(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  // Filtro: solo los que sí se pueden elegir ese día (lo dice el servidor por su turno)
  const [soloPueden, setSoloPueden] = useState(false)
  const cuantosPueden = useMemo(
    () => (validadoPara === fecha ? [...califica.values()].filter(x => x.Eligible === true).length : 0),
    [califica, validadoPara, fecha],
  )

  /**
   * Ninguno califica ese día. Si es porque nadie tiene almuerzo de turno, ya lo dice el
   * aviso de feriado/descanso; si no, se dice el motivo más común (lo da el servidor).
   */
  const ningunoPuede = validadoPara === fecha && califica.size > 0 && cuantosPueden === 0
  const motivoGeneral = useMemo(() => {
    const cuenta = new Map<string, number>()
    califica.forEach(x => x.Reason && cuenta.set(x.Reason, (cuenta.get(x.Reason) ?? 0) + 1))
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }, [califica])

  const vista = useMemo(
    () => (soloPueden ? filtrados.filter(e => !noCalifica(e.Employee_Code)) : filtrados),
    [soloPueden, filtrados, noCalifica],
  )

  // Secciones: mis empleados a cargo, y los otros empleados por módulo
  const secciones = useMemo(() => {
    const propios = vista.filter(e => e.Propio)
    const porModulo = new Map<string, Empleado[]>()
    for (const e of vista.filter(x => !x.Propio)) {
      const m = (e.Modulo_Nombre ?? '').trim() || 'Sin módulo'
      porModulo.set(m, [...(porModulo.get(m) ?? []), e])
    }
    // Cada grupo colapsable. Cerrado, la sección va sin filas (todos = el grupo completo).
    // Buscando o filtrando, todos abiertos: si no, lo encontrado quedaría escondido.
    const buscando = vista.length !== empleados.length
    const out: { key: string; etiqueta?: string; title: string; todos: Empleado[]; data: Empleado[] }[] = []
    const grupo = (key: string, title: string, todos: Empleado[], etiqueta?: string) =>
      out.push({ key, etiqueta, title, todos, data: buscando || abiertos.has(key) ? todos : [] })
    if (propios.length) grupo('propios', 'Mis empleados a cargo', propios)
    ;[...porModulo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([m, data], i) => grupo(`modulo:${m}`, m, data, i === 0 ? 'Otros empleados' : undefined))
    return out
  }, [vista, empleados, abiertos])

  const alternarGrupo = (key: string) =>
    setAbiertos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** Marca o desmarca a todo un grupo de una vez. */
  const alternarDelGrupo = (todos: Empleado[]) =>
    setElegidos(prev => {
      const next = new Set(prev)
      const validos = todos.filter(e => !noCalifica(e.Employee_Code))
      const completo = validos.length > 0 && validos.every(e => next.has(e.Employee_Code))
      validos.forEach(e => (completo ? next.delete(e.Employee_Code) : next.add(e.Employee_Code)))
      return next
    })

  const filtradosValidos = useMemo(() => filtrados.filter(e => !noCalifica(e.Employee_Code)), [filtrados, noCalifica])

  const todosVisibles = useMemo(
    () => filtradosValidos.length > 0 && filtradosValidos.every(e => elegidos.has(e.Employee_Code)),
    [filtradosValidos, elegidos],
  )

  const alternarTodos = () =>
    setElegidos(prev => {
      const next = new Set(prev)
      if (todosVisibles) filtradosValidos.forEach(e => next.delete(e.Employee_Code))
      else filtradosValidos.forEach(e => next.add(e.Employee_Code))
      return next
    })

  // Por qué se pide el almuerzo (en una HE eso lo dice el motivo). Obligatorio.
  const [comentario, setComentario] = useState('')
  const MIN_COMENTARIO = 10
  const comentarioOk = comentario.trim().length >= MIN_COMENTARIO

  const guardar = async () => {
    if (guardando || elegidos.size === 0 || !fecha || !comentarioOk) return
    setGuardando(true)
    try {
      // El horario lo pone el servidor (almuerzo del turno); estos son solo de relleno
      const details: ISaveOvertimeDetail[] = [...elegidos].map(code => ({
        Employee_Code: code,
        Category_Id: null,
        Shift_Id: null,
        Start_Time: `${fecha}T00:00:00`,
        End_Time: `${fecha}T00:30:00`,
        Total_Overtime_Hours: null,
        Is_Manual: true,
        Comment: comentario.trim(),
        Concepts: [],
      }))

      const res = await overtimeService.saveRequest(companyCode, {
        Header: {
          Id: -1,
          Date: fecha,
          Comment: comentario.trim(),
          Auth: autorizar,
          SystemEntities_Id: entidad?.Id ?? null,
          Is_Meal: true,
        },
        Details: details,
      })

      if (!res?.Success) {
        showToast('error', 'No se pudo guardar', res?.ErrorMessage || 'Intente de nuevo', 6000, 'top')
        return
      }
      showToast('success', 'Almuerzo creado', res.SuccessMessage || 'Solicitud guardada', 4000, 'top')
      navigation.goBack()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 6000, 'top')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={cargar} />
  if (!entidad) {
    return (
      <EmptyState
        title="No puedes crear almuerzos"
        message="Tu usuario no tiene la entidad de solicitante de horas extra. Pídeselo a quien administra los accesos."
      />
    )
  }

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$1">
        <AppDatePicker label="Día" value={fecha} onChange={d => setFecha(d ?? hoyISO())} isDateDisabled={esFinDeSemana} />

        <XStack
          alignItems="flex-start"
          gap="$2"
          padding="$2.5"
          marginBottom="$2"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
        >
          <Utensils size={14} color={theme.textMuted?.val as string} style={{ marginTop: 1 }} />
          <Text fontSize={11} color="$textMuted" flex={1}>
            Se registra 0.5 h en el almuerzo del turno de cada empleado. Solo en días con jornada (ni feriado ni descanso).
            {validando ? ' Revisando quién califica…' : ''}
          </Text>
        </XStack>

        {/* No se pudo revisar quién califica: nadie se puede elegir hasta reintentar */}
        {!!errorValidacion && !validando && (
          <XStack
            alignItems="center"
            gap="$2"
            padding="$2.5"
            marginBottom="$2"
            borderRadius={10}
            borderWidth={1}
            borderColor="$error"
            backgroundColor="$backgroundSurface"
          >
            <Text fontSize={11} color="$error" flex={1} fontWeight="600">
              {errorValidacion} No se puede elegir a nadie hasta revisarlo.
            </Text>
            <Text
              fontSize={11}
              fontWeight="800"
              color="$primary"
              onPress={() => setEmpleados(prev => [...prev])}
            >
              Reintentar
            </Text>
          </XStack>
        )}

        {/* Feriado o descanso entre semana: nadie tiene almuerzo de turno ese día */}
        {diaSinAlmuerzo && !validando && (
          <XStack
            alignItems="flex-start"
            gap="$2"
            padding="$2.5"
            marginBottom="$2"
            borderRadius={10}
            borderWidth={1}
            borderColor="$warning"
            backgroundColor="$backgroundSurface"
          >
            <Utensils size={14} color={theme.warning?.val as string} style={{ marginTop: 1 }} />
            <Text fontSize={11} color="$warning" flex={1} fontWeight="600">
              Ese día no hay almuerzo de turno (feriado o descanso). Elija otro día; en feriado o descanso el
              almuerzo se da dentro de la hora extra (Otorgar almuerzo).
            </Text>
          </XStack>
        )}

        {/* Ninguno califica por otro motivo (migrado, ya tienen HE en el almuerzo…) */}
        {ningunoPuede && !diaSinAlmuerzo && !validando && (
          <XStack
            alignItems="flex-start"
            gap="$2"
            padding="$2.5"
            marginBottom="$2"
            borderRadius={10}
            borderWidth={1}
            borderColor="$warning"
            backgroundColor="$backgroundSurface"
          >
            <Utensils size={14} color={theme.warning?.val as string} style={{ marginTop: 1 }} />
            <Text fontSize={11} color="$warning" flex={1} fontWeight="600">
              Ese día ninguno de sus empleados puede pedir almuerzo.{motivoGeneral ? ` Motivo: ${motivoGeneral}.` : ''} Elija otro día.
            </Text>
          </XStack>
        )}

        <SearchInput
          data={empleados}
          searchKeys={['Employee_Name', 'Employee_Code', 'Departamento', 'Modulo_Nombre']}
          onResults={setFiltrados}
          placeholder="Buscar empleado"
        />

        {empleados.length > 0 && (
          <XStack alignItems="center" justifyContent="space-between" paddingVertical="$1">
            <XStack alignItems="center" gap="$2" pressStyle={{ opacity: 0.6 }} onPress={alternarTodos}>
              {todosVisibles
                ? <CheckSquare size={15} color={theme.primary?.val as string} />
                : <Square size={15} color={theme.textMuted?.val as string} />}
              <Text fontSize={12} color="$textMuted">
                {todosVisibles ? 'Quitar todos' : 'Seleccionar todos'}
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$2">
              {/* Filtro: solo los que sí se pueden elegir ese día */}
              <XStack
                alignItems="center"
                gap="$1"
                paddingHorizontal={8}
                paddingVertical={3}
                borderRadius={20}
                borderWidth={1}
                borderColor={soloPueden ? '$primary' : '$border'}
                backgroundColor={soloPueden ? '$primaryOpacity2' : 'transparent'}
                opacity={validadoPara === fecha ? 1 : 0.5}
                pressStyle={{ opacity: 0.6 }}
                onPress={() => validadoPara === fecha && setSoloPueden(v => !v)}
              >
                {soloPueden
                  ? <CheckSquare size={12} color={theme.primary?.val as string} />
                  : <Square size={12} color={theme.textMuted?.val as string} />}
                <Text fontSize={11} fontWeight="600" color={soloPueden ? '$primary' : '$textMuted'}>
                  Solo los que pueden ({cuantosPueden})
                </Text>
              </XStack>
              <Text fontSize={11} color="$textMuted">
                {elegidos.size} sel.
              </Text>
            </XStack>
          </XStack>
        )}
      </YStack>

      <SectionList
        sections={secciones}
        keyExtractor={e => e.Employee_Code}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={
          filtrados.length === 0 ? { flexGrow: 1 } : { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }
        }
        renderSectionHeader={({ section }) => {
          const abierto = section.data.length > 0
          const marcados = section.todos.filter(e => elegidos.has(e.Employee_Code)).length
          const validos = section.todos.filter(e => !noCalifica(e.Employee_Code)).length
          const completo = validos > 0 && marcados === validos
          return (
            <YStack paddingTop="$3" paddingBottom={abierto ? '$2' : 0} gap="$1.5">
              {/* "Otros empleados" encabeza los grupos por módulo */}
              {!!section.etiqueta && (
                <Text fontSize={12} fontWeight="800" color="$text" textTransform="uppercase" letterSpacing={0.5}>
                  {section.etiqueta}
                </Text>
              )}
              <XStack
                alignItems="center"
                gap="$2"
                paddingHorizontal="$3"
                paddingVertical="$2.5"
                borderRadius={12}
                borderWidth={1}
                borderColor="$border"
                backgroundColor="$backgroundSurface"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => alternarGrupo(section.key)}
              >
                {abierto
                  ? <ChevronDown size={16} color={theme.textMuted?.val as string} />
                  : <ChevronRight size={16} color={theme.textMuted?.val as string} />}
                <Text flex={1} fontSize={13} fontWeight="800" color="$text" numberOfLines={1}>
                  {section.title}
                </Text>
                <Text fontSize={11} color="$textMuted">
                  {marcados > 0 ? `${marcados}/${section.todos.length}` : section.todos.length}
                </Text>
                {/* Marcar todo el grupo sin abrirlo */}
                <View padding={4} hitSlop={8} pressStyle={{ opacity: 0.6 }} onPress={() => alternarDelGrupo(section.todos)}>
                  {completo
                    ? <CheckSquare size={18} color={theme.primary?.val as string} />
                    : <Square size={18} color={theme.textMuted?.val as string} />}
                </View>
              </XStack>
            </YStack>
          )
        }}
        ItemSeparatorComponent={() => <View height={8} />}
        ListEmptyComponent={
          <EmptyState title="Sin empleados" message="No tienes empleados a cargo para pedir almuerzo." />
        }
        renderItem={({ item }) => {
          const activo = elegidos.has(item.Employee_Code)
          // No califica ese día: deshabilitado, con el motivo (no llega a guardar)
          const fuera = noCalifica(item.Employee_Code)
          // Sin respuesta del servidor para esta fecha: todavía no se sabe (o falló)
          const pendiente = validadoPara !== fecha
          const motivo = !fuera ? null
            : pendiente ? (errorValidacion ? 'No se pudo revisar su turno' : 'Revisando su turno…')
            : califica.get(item.Employee_Code.trim())?.Reason || 'No califica ese día'
          return (
            <XStack
              alignItems="center"
              gap="$2.5"
              paddingHorizontal="$3"
              paddingVertical="$2.5"
              borderRadius={12}
              borderWidth={1}
              borderColor={activo ? '$primary' : '$border'}
              backgroundColor={activo ? '$primaryOpacity2' : '$backgroundElevated'}
              opacity={fuera ? 0.5 : 1}
              pressStyle={fuera ? undefined : { opacity: 0.7 }}
              onPress={() => alternar(item.Employee_Code)}
            >
              {activo
                ? <CheckSquare size={18} color={theme.primary?.val as string} />
                : <Square size={18} color={theme.textMuted?.val as string} />}
              <YStack flex={1} minWidth={0}>
                <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
                  {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
                </Text>
                <Text fontSize={10} color={fuera && !pendiente ? '$warning' : '$textMuted'} numberOfLines={2}>
                  {fuera ? motivo : item.Departamento}
                </Text>
              </YStack>
            </XStack>
          )
        }}
      />

      {/* Pie: autorizar al crear (como en HE) y guardar */}
      <YStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        gap="$2.5"
        borderTopWidth={1}
        borderTopColor="$border"
        backgroundColor="$backgroundElevated"
      >
        <AppInput
          label="¿Por qué se pide el almuerzo?"
          multiline
          minLines={2}
          maxLength={500}
          value={comentario}
          onChangeText={setComentario}
          placeholder="Comentario"
          error={comentario.length > 0 && !comentarioOk ? `Mínimo ${MIN_COMENTARIO} caracteres` : undefined}
        />

        <XStack alignItems="center" gap="$2" pressStyle={{ opacity: 0.6 }} onPress={() => setAutorizar(a => !a)}>
          {autorizar
            ? <CheckSquare size={17} color={theme.primary?.val as string} />
            : <Square size={17} color={theme.textMuted?.val as string} />}
          <Text fontSize={13} color="$text">
            Autorizar al crear
          </Text>
        </XStack>

        <Button
          height={44}
          borderRadius={10}
          backgroundColor="$primary"
          pressStyle={{ opacity: 0.85 }}
          disabled={guardando || elegidos.size === 0 || !comentarioOk}
          opacity={elegidos.size === 0 || !comentarioOk ? 0.5 : 1}
          onPress={guardar}
        >
          <XStack alignItems="center" gap="$2">
            {guardando ? <Spinner size="small" color="white" /> : <Check size={16} color="white" />}
            <Text fontSize={14} fontWeight="700" color="white">
              {guardando ? 'Guardando…' : `Crear almuerzo${elegidos.size > 0 ? ` (${elegidos.size})` : ''}`}
            </Text>
          </XStack>
        </Button>
      </YStack>
    </View>
  )
}
