import React, { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Input, Spinner, useTheme } from 'tamagui'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Search, X, UserCheck, DoorOpen, Clock, LogIn, LogOut, ArrowRightLeft, AlertCircle, IdCard } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import AppDatePicker from '../../components/commons/AppDatePicker'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { capitalizar, sinCodigo, textoCarnet } from './paseFormat'
import { IAprobador, IEmpleado, IPaseCategoria } from '../../api/modules/pases/pases.types'

/**
 * Crear un permiso personal.
 *
 * Tres cosas que definen esta pantalla:
 *
 * 1. Por omisión el permiso es PARA UNO MISMO, y la persona ya viene elegida.
 *    Solo quien tiene el acceso 'PasesDeTodos' puede cambiarla y buscar a otro.
 *
 * 2. Una sola pregunta define el permiso: qué va a hacer. De esos cuatro chips
 *    sale cuántas horas se piden y en qué orden — no hay que elegir "categoría"
 *    y después entender qué campos aparecen.
 *
 * 3. Sin código de planilla vinculado no hay pase posible: el pase guarda a qué
 *    empleado corresponde y el carnet que se lee en la puerta es el de ese
 *    código. Se dice de entrada y con qué hacer, en vez de fallar al guardar.
 */

const tieneAcceso = (access: string | null | undefined, key: string) =>
  (access ?? '').split(',').map(s => s.trim()).includes(key)

/** Puede crear permisos a nombre de cualquier empleado. */
const ACCESO_TODOS = 'PasesDeTodos'
/** Sus permisos no pasan por un jefe: van directo a RR. HH. */
const ACCESO_SIN_JEFE = 'PaseSinJefe'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtHora = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const horaADate = (hhmm?: string | null): Date => {
  const d = new Date()
  const [h, m] = (hhmm ?? '').split(':')
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0)
  return d
}

/** Ahora redondeado a los próximos 15 minutos: en el caso normal no hay que tocarla. */
const proximoCuarto = (): string => {
  const d = new Date()
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0)
  return fmtHora(d)
}

const sumarHoras = (hhmm: string, horas: number): string => {
  const d = horaADate(hhmm)
  d.setHours(d.getHours() + horas)
  return fmtHora(d)
}

/** Los minutos del día, para comparar dos horas sin armar fechas. */
const enMinutos = (hhmm?: string | null): number => {
  const [h, m] = (hhmm ?? '').split(':')
  return (Number(h) || 0) * 60 + (Number(m) || 0)
}

/** Orden en que se ofrecen los cuatro casos. Lo más pedido primero. */
const ORDEN_TIPO = ['S', 'SE', 'E', 'ES']

const ICONO_TIPO: Record<string, any> = { S: LogOut, E: LogIn, SE: ArrowRightLeft, ES: ArrowRightLeft }

/**
 * Los campos de hora que pide cada secuencia, EN ORDEN. La etiqueta cambia
 * según el caso: la misma hora de entrada es "Entra" si el pase empieza
 * entrando y "Regresa" si empieza saliendo.
 */
const camposDeHora = (tipo?: string): Array<{ campo: 'S' | 'E'; label: string }> => {
  switch (tipo) {
    case 'S': return [{ campo: 'S', label: 'Hora de salida' }]
    case 'E': return [{ campo: 'E', label: 'Hora de entrada' }]
    case 'SE': return [{ campo: 'S', label: 'Sale' }, { campo: 'E', label: 'Regresa' }]
    case 'ES': return [{ campo: 'E', label: 'Entra' }, { campo: 'S', label: 'Sale' }]
    default: return []
  }
}

export default function PaseCrearScreen() {
  // `theme` del contexto es el modo claro/oscuro; `tokens` son los colores.
  const { user, theme: modo } = useAuth()
  const { showToast } = useShowToast()
  const tokens = useTheme()

  const puedeTerceros = tieneAcceso(user?.Access, ACCESO_TODOS)
  const sinJefe = tieneAcceso(user?.Access, ACCESO_SIN_JEFE)

  const [categorias, setCategorias] = useState<IPaseCategoria[]>([])
  const [aprobadores, setAprobadores] = useState<IAprobador[]>([])

  // Empleado del pase. Arranca en uno mismo.
  const [empleado, setEmpleado] = useState<IEmpleado | null>(null)
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null)
  const [cargandoYo, setCargandoYo] = useState(true)

  // Búsqueda (solo con el acceso)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<IEmpleado[]>([])
  const [buscando, setBuscando] = useState(false)
  const debounceRef = useRef<any>(null)

  // Formulario
  const [categoriaId, setCategoriaId] = useState<number | undefined>(undefined)
  const [horaSalida, setHoraSalida] = useState<string | null>(null)
  const [horaEntrada, setHoraEntrada] = useState<string | null>(null)
  const [pickerHora, setPickerHora] = useState<'S' | 'E' | null>(null)
  const [fecha, setFecha] = useState<string | null>(null)
  const [aprobadorUser, setAprobadorUser] = useState<string | undefined>(undefined)
  const [observacion, setObservacion] = useState('')
  const [saving, setSaving] = useState(false)

  usePasesHeader('Crear permiso')

  const categoriaSel = categorias.find(c => c.Id === categoriaId)
  const secuencia = categoriaSel?.Tipo

  useEffect(() => {
    ;(async () => {
      try {
        const [cat, apr] = await Promise.all([
          pasesService.getCategorias(true),
          pasesService.getAprobadores(''),
        ])
        if (cat.Success) setCategorias(cat.Data ?? [])
        if (apr.Success) setAprobadores(apr.Data ?? [])
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
      }
    })()
  }, [])

  // Mi empleado: deja el permiso listo para mí, que es el caso normal.
  useEffect(() => {
    if (!user?.Code) return

    ;(async () => {
      try {
        const resp = await pasesService.getMiEmpleado(user.Code)

        if (resp?.Success && resp.Data) {
          setEmpleado(resp.Data)
          preseleccionarJefe(resp.Data)
        } else if (resp?.ErrorMessage) {
          setErrorVinculo(resp.ErrorMessage)
        }
      } catch (err) {
        setErrorVinculo(handleError(err).message)
      }
      setCargandoYo(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code])

  const preseleccionarJefe = (e: IEmpleado) => {
    if (sinJefe || !e.JefeCode) return
    const jefe = aprobadores.find(a => a.ExternalCode && a.ExternalCode === e.JefeCode)
    if (jefe) setAprobadorUser(jefe.User_Code)
  }

  // Los aprobadores pueden llegar después que el empleado.
  useEffect(() => {
    if (empleado && !aprobadorUser) preseleccionarJefe(empleado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aprobadores])

  const onChangeQuery = (text: string) => {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!text.trim() || !user?.Code) {
      setResultados([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const resp = await pasesService.buscarEmpleados(user.Code, text.trim())
        if (resp.Success) setResultados(resp.Data ?? [])
        else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo buscar', 4000, 'bottom')
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
      }
      setBuscando(false)
    }, 400)
  }

  const seleccionarEmpleado = (e: IEmpleado) => {
    setEmpleado(e)
    setResultados([])
    setQuery('')
    preseleccionarJefe(e)
  }

  /**
   * Al elegir qué va a hacer se precargan las horas: la primera a los próximos
   * 15 minutos y la segunda una hora después. Solo si están vacías, para no
   * pisar lo que la persona ya escribió al cambiar de opción.
   */
  const elegirCategoria = (c: IPaseCategoria) => {
    setCategoriaId(c.Id)

    const primera = proximoCuarto()

    if (c.Tipo === 'S') { if (!horaSalida) setHoraSalida(primera); setHoraEntrada(null) }
    if (c.Tipo === 'E') { if (!horaEntrada) setHoraEntrada(primera); setHoraSalida(null) }
    if (c.Tipo === 'SE') {
      const s = horaSalida ?? primera
      setHoraSalida(s)
      if (!horaEntrada) setHoraEntrada(sumarHoras(s, 1))
    }
    if (c.Tipo === 'ES') {
      const e = horaEntrada ?? primera
      setHoraEntrada(e)
      if (!horaSalida) setHoraSalida(sumarHoras(e, 1))
    }
  }

  const valorDe = (campo: 'S' | 'E') => (campo === 'S' ? horaSalida : horaEntrada)
  const setValorDe = (campo: 'S' | 'E', v: string) => (campo === 'S' ? setHoraSalida(v) : setHoraEntrada(v))

  const crear = async () => {
    if (!empleado) return showToast('error', 'Validación', 'Falta el empleado del permiso', 4000, 'bottom')
    if (!categoriaId || !secuencia) return showToast('error', 'Validación', 'Elegí qué va a hacer', 4000, 'bottom')
    if (!fecha) return showToast('error', 'Validación', 'Elegí la fecha', 4000, 'bottom')

    for (const { campo, label } of camposDeHora(secuencia)) {
      if (!valorDe(campo)) return showToast('error', 'Validación', `Falta la hora: ${label}`, 4000, 'bottom')
    }

    if (secuencia === 'SE' && enMinutos(horaEntrada) <= enMinutos(horaSalida))
      return showToast('error', 'Validación', 'El regreso tiene que ser después de la salida', 4000, 'bottom')

    if (secuencia === 'ES' && enMinutos(horaSalida) <= enMinutos(horaEntrada))
      return showToast('error', 'Validación', 'La salida tiene que ser después de la entrada', 4000, 'bottom')

    if (!sinJefe && !aprobadorUser)
      return showToast('error', 'Validación', 'Elegí quién autoriza', 4000, 'bottom')

    setSaving(true)
    try {
      const resp = await pasesService.crear({
        EmpleadoCode: empleado.EmpleadoCode,
        Categoria_Id: categoriaId,
        FechaPase: fecha,
        HoraSalida: secuencia.includes('S') ? horaSalida : null,
        HoraEntrada: secuencia.includes('E') ? horaEntrada : null,
        Observacion: observacion.trim() || null,
        Create_By: user!.Code,
        AprobadorUser: sinJefe ? undefined : aprobadorUser,
        AprobadorNombre: sinJefe ? undefined : aprobadores.find(a => a.User_Code === aprobadorUser)?.Nombre,
      })

      if (resp.Success) {
        showToast(
          'success',
          'Listo',
          resp.Data?.SinJefe
            ? 'Permiso creado. Queda pendiente de RR. HH.'
            : 'Permiso creado. Queda pendiente de tu jefe y después de RR. HH.',
          5000,
          'bottom',
        )
        setCategoriaId(undefined)
        setHoraSalida(null)
        setHoraEntrada(null)
        setFecha(null)
        setObservacion('')
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo crear el permiso', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setSaving(false)
  }

  const chips = [...categorias].sort(
    (a, b) => ORDEN_TIPO.indexOf(a.Tipo ?? '') - ORDEN_TIPO.indexOf(b.Tipo ?? ''),
  )

  // Sin código vinculado no se puede crear nada: la pantalla lo dice y se queda ahí.
  if (errorVinculo) {
    return (
      <Page>
        <YStack padding="$4" gap="$3">
          <YStack
            backgroundColor="$backgroundElevated"
            borderRadius="$4"
            padding="$4"
            gap="$3"
            borderWidth={1}
            borderColor="$border"
          >
            <XStack alignItems="center" gap="$2.5">
              <AlertCircle size={20} color="#EF4444" />
              <Text fontSize={15} fontWeight="700" color="$text">
                No se puede crear el permiso
              </Text>
            </XStack>

            <Text fontSize={13} color="$textMuted">{errorVinculo}</Text>

            <XStack alignItems="flex-start" gap="$2">
              <View marginTop={2}><IdCard size={14} color="#94A3B8" /></View>
              <Text fontSize={11} color="$textMuted" flex={1}>
                El código de empleado es el que trae tu carnet, y es con el que Seguridad
                encuentra el permiso en la puerta. Sin él no hay forma de saber a qué
                empleado corresponde.
              </Text>
            </XStack>
          </YStack>
        </YStack>
      </Page>
    )
  }

  return (
    <Page>
      <ScrollView flex={1} backgroundColor="$backgroundPage" keyboardShouldPersistTaps="handled">
        <YStack padding="$4" gap="$3.5">

          {/* ── Para quién ────────────────────────────────────────────── */}
          <YStack gap="$2">
            <Text fontSize={12} fontWeight="600" color="$textMuted">Permiso para</Text>

            {cargandoYo && !empleado ? (
              <XStack alignItems="center" gap="$2" paddingVertical="$2">
                <Spinner size="small" color="$primary" />
                <Text fontSize={13} color="$textMuted">Cargando...</Text>
              </XStack>
            ) : empleado ? (
              <XStack
                backgroundColor="$backgroundElevated"
                borderRadius="$4"
                padding="$3"
                alignItems="center"
                gap="$3"
                borderWidth={1}
                borderColor="$primary"
              >
                <View
                  width={38}
                  height={38}
                  borderRadius={19}
                  backgroundColor="rgba(255,85,26,0.12)"
                  justifyContent="center"
                  alignItems="center"
                >
                  <UserCheck size={18} color="#FF551A" />
                </View>
                <YStack flex={1}>
                  <Text fontWeight="700" fontSize={14} color="$text">
                    {sinCodigo(empleado.EmpleadoNombre)}
                  </Text>
                  <Text fontSize={12} color="$textMuted">
                    {textoCarnet(empleado)}
                    {empleado.Departamento ? ` · ${sinCodigo(empleado.Departamento)}` : ''}
                  </Text>
                </YStack>

                {/* Cambiar de persona solo con el acceso: sin él, el permiso es
                    para uno mismo y no hay nada que elegir. */}
                {puedeTerceros && (
                  <View onPress={() => setEmpleado(null)} pressStyle={{ opacity: 0.6 }} padding="$2">
                    <X size={18} color={tokens.textMuted?.val as string} />
                  </View>
                )}
              </XStack>
            ) : (
              <YStack gap="$2">
                <XStack
                  backgroundColor="$backgroundElevated"
                  borderRadius="$3"
                  paddingHorizontal="$3"
                  alignItems="center"
                  gap="$2"
                  borderWidth={1}
                  borderColor="$border"
                  height={44}
                >
                  <Search size={16} color={tokens.textMuted?.val as string} />
                  <Input
                    flex={1}
                    value={query}
                    onChangeText={onChangeQuery}
                    placeholder="Buscar por nombre o código…"
                    placeholderTextColor="$textMuted"
                    borderWidth={0}
                    backgroundColor="transparent"
                    fontSize={13}
                    color="$text"
                    padding={0}
                  />
                  {buscando && <Spinner size="small" color="$primary" />}
                </XStack>

                {resultados.map((e) => (
                  <View
                    key={e.EmpleadoCode}
                    onPress={() => seleccionarEmpleado(e)}
                    pressStyle={{ opacity: 0.6 }}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$3"
                    paddingVertical="$2.5"
                    paddingHorizontal="$3"
                    borderWidth={1}
                    borderColor="$border"
                  >
                    <Text fontWeight="600" fontSize={13} color="$text">
                      {sinCodigo(e.EmpleadoNombre)}
                    </Text>
                    <Text fontSize={11} color="$textMuted">
                      {textoCarnet(e)}{e.Departamento ? ` · ${sinCodigo(e.Departamento)}` : ''}
                    </Text>
                  </View>
                ))}
              </YStack>
            )}
          </YStack>

          {/* ── Qué va a hacer: la única pregunta ─────────────────────── */}
          <YStack gap="$2">
            <Text fontSize={12} fontWeight="600" color="$textMuted">¿Qué va a hacer?</Text>

            <XStack flexWrap="wrap" gap="$2">
              {chips.map((c) => {
                const activo = c.Id === categoriaId
                const Icono = ICONO_TIPO[c.Tipo ?? ''] ?? DoorOpen

                return (
                  <XStack
                    key={c.Id}
                    alignItems="center"
                    gap="$1.5"
                    paddingHorizontal="$3"
                    paddingVertical="$2.5"
                    borderRadius={999}
                    borderWidth={1}
                    borderColor={activo ? '$primary' : '$border'}
                    backgroundColor={activo ? 'rgba(255,85,26,0.12)' : '$backgroundElevated'}
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => elegirCategoria(c)}
                  >
                    <Icono size={14} color={activo ? '#FF551A' : '#94A3B8'} />
                    <Text
                      fontSize={13}
                      fontWeight={activo ? '700' : '500'}
                      color={activo ? '$primary' : '$textMuted'}
                    >
                      {c.Name}
                    </Text>
                  </XStack>
                )
              })}
            </XStack>
          </YStack>

          {/* ── Las horas que pide esa opción ─────────────────────────── */}
          {!!secuencia && (
            <YStack gap="$2">
              <Text fontSize={12} fontWeight="600" color="$textMuted">
                {camposDeHora(secuencia).length > 1 ? 'Horas previstas' : 'Hora prevista'}
              </Text>

              <XStack gap="$2">
                {camposDeHora(secuencia).map(({ campo, label }) => (
                  <View
                    key={campo}
                    flex={1}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={pickerHora === campo ? '$primary' : '$border'}
                    paddingHorizontal="$3"
                    paddingVertical="$2.5"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => setPickerHora(pickerHora === campo ? null : campo)}
                  >
                    <XStack alignItems="center" justifyContent="space-between">
                      <YStack>
                        <Text fontSize={11} color="$textMuted">{label}</Text>
                        <Text fontSize={15} fontWeight="600" color="$text">
                          {valorDe(campo) ?? '--:--'}
                        </Text>
                      </YStack>
                      <Clock size={16} color="#94A3B8" />
                    </XStack>
                  </View>
                ))}
              </XStack>

              {!!pickerHora && (
                <View backgroundColor="$backgroundSurface" borderRadius="$3" padding="$2">
                  <DateTimePicker
                    value={horaADate(valorDe(pickerHora) ?? proximoCuarto())}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    themeVariant={modo === 'dark' ? 'dark' : 'light'}
                    onChange={(_, d) => {
                      if (Platform.OS !== 'ios') setPickerHora(null)
                      if (!d) return
                      setValorDe(pickerHora, fmtHora(d))
                    }}
                  />
                  {Platform.OS === 'ios' && (
                    <Button
                      height={40}
                      backgroundColor="$primary"
                      borderRadius="$3"
                      pressStyle={{ opacity: 0.8 }}
                      onPress={() => setPickerHora(null)}
                    >
                      <Text color="white" fontWeight="700">Listo</Text>
                    </Button>
                  )}
                </View>
              )}

              <Text fontSize={11} color="$textMuted">
                Seguridad va a registrar la hora real y la va a comparar con esta.
              </Text>
            </YStack>
          )}

          {/* ── Fecha ─────────────────────────────────────────────────── */}
          <AppDatePicker
            label="Fecha del permiso"
            mode="single"
            direction="future"
            value={fecha}
            onChange={setFecha}
          />

          {/* ── Quién autoriza ───────────────────────────────────────── */}
          {sinJefe ? (
            <XStack
              alignItems="flex-start"
              gap="$2"
              backgroundColor="$backgroundElevated"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$border"
              padding="$3"
            >
              <View marginTop={2}><UserCheck size={14} color="#22C55E" /></View>
              <Text fontSize={12} color="$textMuted" flex={1}>
                Tu permiso lo autoriza RR. HH. directamente, sin pasar por un jefe.
              </Text>
            </XStack>
          ) : (
            <AppSelect
              label="Autoriza (jefe inmediato)"
              value={aprobadorUser}
              onValueChange={(v) => setAprobadorUser(String(v))}
              options={aprobadores.map((a) => ({ label: capitalizar(a.Nombre), value: a.User_Code }))}
            />
          )}

          <AppInput label="Observación (opcional)" value={observacion} onChangeText={setObservacion} />

          {/* Que quede claro que aprobar no es un solo paso. */}
          <Text fontSize={11} color="$textMuted" paddingHorizontal="$1">
            {sinJefe
              ? 'El permiso sirve en la puerta cuando RR. HH. lo autorice.'
              : 'El permiso sirve en la puerta cuando lo autoricen tu jefe y RR. HH.'}
          </Text>

          <Button
            height={48}
            backgroundColor="$primary"
            borderRadius="$4"
            pressStyle={{ opacity: 0.7 }}
            onPress={crear}
            disabled={saving}
            opacity={saving ? 0.6 : 1}
            icon={saving ? <Spinner color="white" /> : <DoorOpen size={18} color="white" />}
          >
            <Text color="white" fontWeight="700">Crear permiso</Text>
          </Button>

        </YStack>
      </ScrollView>
    </Page>
  )
}
