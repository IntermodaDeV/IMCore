import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl, KeyboardAvoidingView, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { YStack, XStack, Text, ScrollView, View, Button, Spinner, Input, styled } from 'tamagui'
import {
  RotateCw, ChevronDown, Users, Layers, Search, X, Plus,
  Check, AlertCircle, UserCheck, UserX,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  IConfiguracionAprobadores,
  IUsuarioBusqueda,
} from '../../api/modules/cooperativa/cooperativa.types'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import AppInput from '../../components/commons/AppInput'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'

/**
 * Configuración de aprobadores (ruta 'ConfigAprobadores').
 *
 * La configuración es por COMBINACIÓN de dos cosas:
 *
 *   Tipo de planilla    semanal, quincenal, mensual, sin clasificar
 *   Tipo de estructura  Directo, Indirecto, Administrativo, Seguridad...
 *
 * Son ~24 combinaciones, así que van en pestañas por planilla y dentro una
 * tarjeta por tipo. Todas en una sola lista serían dos pantallas de scroll donde
 * es fácil editar la equivocada.
 *
 * La rejilla NO está guardada: la API la arma cruzando los tipos de planilla con
 * los de la estructura contable (en vivo, vía proxy) y con lo configurado. Un
 * tipo nuevo aparece acá sin que nadie lo siembre.
 *
 * Cada combinación se guarda por separado. No hay un "guardar todo": son
 * decisiones independientes y un guardado masivo obligaría a revisar las demás
 * para cambiar una.
 */

const RotateCwStyled = styled(RotateCw, { color: '$text' })

/** Solo dígitos: las aprobaciones mínimas son un conteo. */
const soloEntero = (v: string) => v.replace(/[^0-9]/g, '')

/**
 * La clave de una combinación.
 *
 * Una función y no una concatenación suelta: se usa para el estado de edición,
 * para saber qué tarjeta está abierta y para el `key` de React. Si un lugar la
 * armara distinto, lo escrito en una tarjeta aparecería en otra.
 */
const claveDe = (c: IConfiguracionAprobadores) => `${c.TipoPlanilla}|${c.Tipo}`

/**
 * Desde cuántas letras se busca.
 *
 * Con una sola el resultado son las primeras 25 de cientos, que no dice nada y
 * hace un viaje al servidor por cada tecla del principio.
 */
const MIN_BUSQUEDA = 2

export default function ConfigAprobadoresScreen() {
  const [configs, setConfigs] = useState<IConfiguracionAprobadores[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  // El buscador de usuarios. Uno solo y no uno por tarjeta porque solo hay una
  // tarjeta abierta a la vez.
  //
  // Se busca en el servidor en vez de traer todos los usuarios: son cientos, no
  // se pueden pintar en una pantalla de celular, y bajarlos todos para filtrar
  // acá es cargar de más para mostrar de menos.
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<IUsuarioBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)

  // Código -> nombre, de todo el que se haya visto: lo que venía configurado y
  // lo que aparezca en las búsquedas.
  //
  // Hace falta porque lo elegido son códigos y la lista de usuarios ya no está
  // completa en memoria. Sin esto, al marcar a alguien su ficha se vería como
  // 'lchinchilla' hasta recargar la pantalla.
  const [nombres, setNombres] = useState<Record<string, string>>({})

  // Qué tarjeta está abierta. UNA a la vez: cada una tiene un campo y una lista
  // de casillas, y con varias abiertas la pantalla se vuelve un formulario
  // gigante donde es fácil guardar la equivocada.
  const [abierta, setAbierta] = useState<string | null>(null)

  // La pestaña de planilla. Arranca en la primera que traiga el servidor.
  const [planilla, setPlanilla] = useState<string | null>(null)

  // La edición en curso, por tipo. Se guarda aparte de `configs` para que lo
  // escrito no se pierda al recargar la lista, y para saber qué cambió.
  const [minimos, setMinimos] = useState<Record<string, string>>({})
  const [marcados, setMarcados] = useState<Record<string, string[]>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  const { showToast } = useShowToast()

  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  const consultar = useCallback(async () => {
    try {
      const conf = await cooperativaService.getConfiguracionAprobadores()

      if (conf?.Success) {
        const lista = conf.Data ?? []
        setConfigs(lista)

        // Los nombres de lo que ya venía configurado. El servidor los resuelve
        // porque acá solo hay códigos guardados.
        setNombres(prev => {
          const mapa = { ...prev }

          lista.forEach(c =>
            (c.AprobadoresInfo ?? []).forEach(u => {
              if (u.User_Code) mapa[u.User_Code] = u.Nombre || u.User_Code
            }),
          )

          return mapa
        })

        // El estado de edición arranca con lo guardado, indexado por
        // combinación.
        setMinimos(
          Object.fromEntries(lista.map(c => [claveDe(c), String(c.AprobacionesMinimas ?? 0)])),
        )
        setMarcados(
          Object.fromEntries(lista.map(c => [claveDe(c), c.AprobadoresLista ?? []])),
        )

        // La primera pestaña, si todavía no hay una elegida.
        setPlanilla(prev => prev ?? lista[0]?.TipoPlanilla ?? null)
      } else {
        setConfigs([])
        showToast(
          'error',
          'Error',
          conf?.ErrorMessage || 'No se pudo cargar la configuración',
          5000,
          'top',
        )
      }
    } catch (err) {
      setConfigs([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    }
    // showToast queda fuera: cambia de identidad en cada render y recargaría en
    // bucle.
  }, [])

  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        setCargando(true)
        await consultar()
        setCargando(false)
      })()
    }, [consultar]),
  )

  // La búsqueda, con espera.
  //
  // Se deja pasar un rato desde la última tecla en vez de consultar en cada
  // una: escribir 'martinez' serían ocho consultas de las que solo importa la
  // última. El temporizador se cancela al volver a escribir.
  useEffect(() => {
    const texto = busqueda.trim()

    if (texto.length < MIN_BUSQUEDA) {
      setResultados([])
      setBuscando(false)
      return
    }

    // Se enciende antes de la espera: el usuario ya escribió y tiene que ver
    // que algo está pasando, no un cuadro vacío durante medio segundo.
    setBuscando(true)

    let vigente = true

    const t = setTimeout(async () => {
      try {
        const response = await cooperativaService.buscarUsuarios(texto)

        // Si mientras respondía se escribió otra cosa, esta respuesta ya no
        // corresponde a lo que está en el campo. Pintarla mostraría resultados
        // de una búsqueda vieja.
        if (!vigente) return

        const lista = response?.Success ? response.Data ?? [] : []
        setResultados(lista)

        // Se guardan los nombres para que lo que se marque se vea con nombre
        // aunque después se limpie la búsqueda.
        setNombres(prev => {
          const mapa = { ...prev }

          lista.forEach(u => {
            if (u.User_Code) mapa[u.User_Code] = u.Nombre || u.User_Code
          })

          return mapa
        })

        if (!response?.Success && response?.ErrorMessage)
          showToast('error', 'Error', response.ErrorMessage, 5000, 'top')
      } catch (err) {
        if (vigente) showToast('error', 'Error', handleError(err).message, 5000, 'top')
      } finally {
        if (vigente) setBuscando(false)
      }
    }, 400)

    return () => {
      vigente = false
      clearTimeout(t)
    }
    // showToast queda fuera a propósito: cambia de identidad en cada render y
    // rearmaría el temporizador sin parar.
  }, [busqueda])

  /** El nombre de un código, o el código si todavía no se conoce. */
  const nombreDe = (code: string) => nombres[code] || code

  /** Abre o cierra una tarjeta, y deja el buscador limpio. */
  const alternar = (clave: string) => {
    setAbierta(prev => (prev === clave ? null : clave))
    setBusqueda('')
    setResultados([])
  }

  const onRefresh = async () => {
    setRefrescando(true)
    await consultar()
    setRefrescando(false)
  }

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Aprobadores
      </Text>
    ),
    right: (
      <View onPress={onRefresh} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <RotateCwStyled size={18} />
      </View>
    ),
  })

  // Las planillas que trajo el servidor, sin repetir y en su orden. Se derivan
  // de la rejilla en vez de pedirse aparte: ya vienen en cada fila.
  const planillas = Array.from(
    new Map(
      configs.map(c => [
        c.TipoPlanilla ?? '',
        { codigo: c.TipoPlanilla ?? '', nombre: c.NombrePlanilla ?? c.TipoPlanilla ?? '', orden: c.OrdenPlanilla },
      ]),
    ).values(),
  ).sort((a, b) => a.orden - b.orden)

  const visibles = configs.filter(c => c.TipoPlanilla === planilla)

  const marcar = (clave: string, code: string) =>
    setMarcados(prev => {
      const actuales = prev[clave] ?? []

      return {
        ...prev,
        [clave]: actuales.includes(code)
          ? actuales.filter(c => c !== code)
          : [...actuales, code],
      }
    })

  const guardar = async (c: IConfiguracionAprobadores) => {
    const clave = claveDe(c)
    const minimo = Number(minimos[clave] ?? '0')
    const elegidos = marcados[clave] ?? []

    // Se valida acá y en el SP. Pedir más firmas que aprobadores deja una
    // cadena que NUNCA se completa: la solicitud se queda trabada en "en
    // aprobación" para siempre.
    if (minimo > elegidos.length) {
      showToast(
        'error',
        'No se puede guardar',
        `Pediste ${minimo} aprobaciones pero marcaste ${elegidos.length} aprobadores. La cadena nunca se completaría.`,
        6000,
        'top',
      )
      return
    }

    setGuardando(clave)
    try {
      const response = await cooperativaService.guardarConfiguracionAprobadores({
        TipoPlanilla: c.TipoPlanilla ?? '',
        Tipo: c.Tipo ?? '',
        AprobacionesMinimas: minimo,
        Aprobadores: elegidos,
      })

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo guardar', 6000, 'top')
        return
      }

      showToast('success', 'Guardado', `${c.NombrePlanilla} · ${c.Tipo}`, 3000, 'top')
      await consultar()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setGuardando(null)
    }
  }

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        flex={1}
        backgroundColor="$backgroundPage"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 + bottomPad, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
      >
        {/* Una pestaña por tipo de planilla. Con ~24 combinaciones en una sola
            lista habría dos pantallas de scroll y sería fácil editar la
            equivocada. El orden lo decide el servidor. */}
        {planillas.length > 1 && (
          <XStack
            gap="$1"
            padding="$1"
            borderRadius="$4"
            backgroundColor="$backgroundSurface"
            borderWidth={1}
            borderColor="$border"
          >
            {planillas.map(pl => {
              const activa = pl.codigo === planilla
              // Cuántas de esa planilla faltan configurar. Es el número que
              // dice dónde falta trabajo.
              const pendientes = configs.filter(
                c => c.TipoPlanilla === pl.codigo && !c.Configurado,
              ).length

              return (
                <View
                  key={pl.codigo}
                  flex={1}
                  paddingVertical="$2.5"
                  borderRadius="$3"
                  alignItems="center"
                  backgroundColor={activa ? '$primary' : 'transparent'}
                  pressStyle={{ opacity: 0.7 }}
                  onPress={() => {
                    setPlanilla(pl.codigo)
                    // Se cierra lo abierto: la tarjeta que estaba desplegada
                    // pertenece a otra pestaña, y con ella el buscador.
                    setAbierta(null)
                    setBusqueda('')
                    setResultados([])
                  }}
                >
                  <Text
                    fontSize={12}
                    fontWeight={activa ? '700' : '600'}
                    color={activa ? 'white' : '$textMuted'}
                    numberOfLines={1}
                  >
                    {pl.nombre}
                  </Text>
                  {pendientes > 0 && (
                    <Text fontSize={10} color={activa ? 'white' : '$warning'}>
                      {pendientes} sin configurar
                    </Text>
                  )}
                </View>
              )
            })}
          </XStack>
        )}

        {visibles.length === 0 ? (
          <YStack
            gap="$3"
            padding="$5"
            borderRadius="$4"
            backgroundColor="$backgroundSurface"
            borderWidth={1}
            borderColor="$border"
            alignItems="center"
            marginTop="$4"
          >
            <Layers size={28} color="#94A3B8" />
            <Text fontSize={15} color="$text" textAlign="center">
              No hay combinaciones para esta planilla.
            </Text>
            <Text fontSize={13} color="$textMuted" textAlign="center" lineHeight={19}>
              Se leen de la estructura contable de planilla. Si esto sigue vacío,
              revisá que el proxy esté respondiendo.
            </Text>
          </YStack>
        ) : (
          visibles.map(c => {
            const clave = claveDe(c)
            const tipo = c.Tipo ?? ''
            const esta = abierta === clave
            const elegidos = marcados[clave] ?? []
            const minimo = Number(minimos[clave] ?? '0')

            // Pediría más firmas que aprobadores: la cadena no se completaría.
            const imposible = minimo > elegidos.length

            const cambiado =
              minimo !== (c.AprobacionesMinimas ?? 0) ||
              elegidos.length !== (c.AprobadoresLista ?? []).length ||
              elegidos.some(x => !(c.AprobadoresLista ?? []).includes(x))

            return (
              <YStack
                key={clave}
                gap="$3"
                padding="$4"
                borderRadius="$4"
                backgroundColor="$backgroundElevated"
                borderWidth={1}
                borderColor={esta ? '$primary' : '$border'}
                {...shadows.sm}
                pressStyle={{ opacity: 0.9 }}
                onPress={() => alternar(clave)}
              >
                {/* Cerrada se lee el resumen: el tipo, cuántas firmas pide y
                    cuántos aprobadores tiene. Eso alcanza para saber si hay algo
                    que revisar sin abrir cada una. */}
                <XStack alignItems="center" gap="$3">
                  <YStack flex={1} gap="$1">
                    <Text fontSize={16} fontWeight="700" color="$text">
                      {tipo}
                    </Text>
                    <Text fontSize={11} color="$textMuted">
                      {c.CentrosCosto > 0
                        ? `${c.CentrosCosto} ${c.CentrosCosto === 1 ? 'centro de costos' : 'centros de costo'}`
                        : 'Sin centros de costo en la estructura'}
                    </Text>
                  </YStack>

                  <YStack alignItems="flex-end" gap="$1">
                    <XStack alignItems="center" gap="$1.5">
                      <Check size={13} color="#94A3B8" />
                      <Text fontSize={13} fontWeight="700" color="$text">
                        {c.AprobacionesMinimas ?? 0}
                      </Text>
                    </XStack>
                    <XStack alignItems="center" gap="$1.5">
                      <Users size={12} color="#94A3B8" />
                      <Text fontSize={11} color="$textMuted">
                        {(c.AprobadoresLista ?? []).length}
                      </Text>
                    </XStack>
                  </YStack>

                  <View rotate={esta ? '180deg' : '0deg'}>
                    <ChevronDown size={18} color="#94A3B8" />
                  </View>
                </XStack>

                {/* Sin configurar: se avisa, porque los números de arriba son
                    los valores por defecto y no una decisión de nadie. */}
                {!c.Configurado && !esta && (
                  <XStack alignItems="center" gap="$2">
                    <AlertCircle size={13} color="#F59E0B" />
                    <Text fontSize={12} color="$warning" flex={1}>
                      Sin configurar
                    </Text>
                  </XStack>
                )}

                {esta && (
                  <YStack gap="$3" paddingTop="$3" borderTopWidth={1} borderTopColor="$border">
                    <AppInput
                      label="Aprobaciones mínimas"
                      value={minimos[clave] ?? '0'}
                      onChangeText={(v: string) =>
                        setMinimos(prev => ({ ...prev, [clave]: soloEntero(v) }))
                      }
                      keyboardType="number-pad"
                      placeholder="0"
                      error={imposible ? `Solo marcaste ${elegidos.length} aprobadores` : undefined}
                      // La regla que más se malinterpreta: este número NO cuenta
                      // la firma del primer aprobador. Él siempre firma — es
                      // quien autoriza — y esto es cuántos de los de abajo
                      // tienen que confirmarlo ADEMÁS de él.
                      statusMessage={
                        imposible
                          ? undefined
                          : minimo === 0
                            ? 'Con 0, el primer aprobador cierra la solicitud.'
                            : `Además del primer aprobador, que siempre firma.`
                      }
                    />

                    <YStack gap="$2.5">
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize={13} fontWeight="700" color="$text" flex={1}>
                          Quiénes pueden aprobar
                        </Text>
                        <Text fontSize={12} color="$textMuted">
                          {elegidos.length}
                        </Text>
                      </XStack>

                      {/* Lo elegido, arriba y siempre visible. Es lo que se va a
                          guardar, así que no puede depender de que la búsqueda
                          esté puesta para poder revisarlo. */}
                      {elegidos.length === 0 ? (
                        <Text fontSize={12} color="$textMuted" lineHeight={17}>
                          Nadie asignado. Buscá abajo y agregá a quienes van a firmar.
                        </Text>
                      ) : (
                        <XStack flexWrap="wrap" gap="$2">
                          {elegidos.map(code => {
                            // Un aprobador dado de baja después de configurarlo.
                            // Se marca en vez de esconderlo: escondido seguiría
                            // guardado y nadie podría quitarlo.
                            const inactivo = (c.AprobadoresInfo ?? []).some(
                              u => u.User_Code === code && !u.Activo,
                            )

                            return (
                              <XStack
                                key={code}
                                alignItems="center"
                                gap="$1.5"
                                paddingVertical="$1.5"
                                paddingHorizontal="$2.5"
                                borderRadius={20}
                                backgroundColor={inactivo ? 'rgba(245,158,11,0.12)' : '$primaryOpacity2'}
                                borderWidth={1}
                                borderColor={inactivo ? '$warning' : '$primary'}
                                pressStyle={{ opacity: 0.7 }}
                                onPress={() => marcar(clave, code)}
                              >
                                {inactivo && <UserX size={12} color="#F59E0B" />}
                                <Text fontSize={12} color="$text" maxWidth={190} numberOfLines={1}>
                                  {nombreDe(code)}
                                </Text>
                                <X size={13} color="#94A3B8" />
                              </XStack>
                            )
                          })}
                        </XStack>
                      )}

                      {/* El buscador. Cualquier usuario, no solo los que ya
                          tienen un acceso de aprobador: acá se está decidiendo
                          justamente quién va a poder firmar. */}
                      <XStack
                        alignItems="center"
                        gap="$2"
                        paddingHorizontal="$3"
                        height={42}
                        borderRadius={10}
                        borderWidth={1}
                        borderColor="$border"
                        backgroundColor="$backgroundSurface"
                      >
                        <Search size={15} color="#94A3B8" />
                        <Input
                          flex={1}
                          unstyled
                          color="$text"
                          fontSize={13}
                          value={busqueda}
                          onChangeText={setBusqueda}
                          placeholder="Nombre, usuario o correo"
                          placeholderTextColor="$textMuted"
                          autoCapitalize="none"
                        />
                        {buscando && <Spinner size="small" color="$primary" />}
                        {!buscando && busqueda.length > 0 && (
                          <View onPress={() => setBusqueda('')} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
                            <X size={15} color="#94A3B8" />
                          </View>
                        )}
                      </XStack>

                      {busqueda.trim().length > 0 && busqueda.trim().length < MIN_BUSQUEDA && (
                        <Text fontSize={11} color="$textMuted">
                          Escribí al menos {MIN_BUSQUEDA} letras.
                        </Text>
                      )}

                      {busqueda.trim().length >= MIN_BUSQUEDA && !buscando && resultados.length === 0 && (
                        <Text fontSize={12} color="$textMuted">
                          Ningún usuario coincide con "{busqueda.trim()}".
                        </Text>
                      )}

                      {resultados.length > 0 && (
                        <YStack
                          borderRadius={10}
                          borderWidth={1}
                          borderColor="$border"
                          backgroundColor="$backgroundSurface"
                          overflow="hidden"
                        >
                          {resultados.map((u, i) => {
                            const code = u.User_Code ?? ''
                            const on = elegidos.includes(code)

                            return (
                              <XStack
                                key={code}
                                alignItems="center"
                                gap="$2.5"
                                padding="$2.5"
                                borderTopWidth={i === 0 ? 0 : 1}
                                borderTopColor="$border"
                                backgroundColor={on ? '$primaryOpacity2' : 'transparent'}
                                pressStyle={{ opacity: 0.6 }}
                                onPress={() => marcar(clave, code)}
                              >
                                <YStack flex={1} gap="$0.5">
                                  <Text fontSize={13} color="$text" numberOfLines={1}>
                                    {u.Nombre || code}
                                  </Text>
                                  <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                                    {code}
                                    {u.TypeName ? ` · ${u.TypeName}` : ''}
                                  </Text>
                                </YStack>

                                {on
                                  ? <Check size={16} color="#FF551A" />
                                  : <Plus size={16} color="#94A3B8" />}
                              </XStack>
                            )
                          })}
                        </YStack>
                      )}

                      {/* El tope lo pone el servidor. Si llegaron justo los 25,
                          hay más que no se están viendo y hay que decirlo: si no,
                          se asume que ese es todo el universo. */}
                      {resultados.length >= 25 && (
                        <Text fontSize={11} color="$textMuted">
                          Se muestran los primeros 25. Escribí más para acotar.
                        </Text>
                      )}
                    </YStack>

                    {/* Guardar solo si algo cambió: un botón siempre activo
                        invita a tocarlo por si acaso, y cada toque es una
                        escritura. */}
                    <XStack justifyContent="flex-end">
                      <Button
                        height={38}
                        borderRadius={10}
                        paddingHorizontal="$4"
                        backgroundColor={cambiado && !imposible ? '$primary' : '$backgroundHover'}
                        disabled={!cambiado || imposible || guardando === clave}
                        pressStyle={{ opacity: 0.85 }}
                        onPress={() => guardar(c)}
                      >
                        <XStack alignItems="center" gap="$1.5">
                          {guardando === clave
                            ? <Spinner size="small" color="white" />
                            : <UserCheck size={15} color={cambiado && !imposible ? 'white' : '#94A3B8'} />}
                          <Text
                            fontSize={13}
                            fontWeight="700"
                            color={cambiado && !imposible ? 'white' : '$textMuted'}
                          >
                            Guardar
                          </Text>
                        </XStack>
                      </Button>
                    </XStack>
                  </YStack>
                )}
              </YStack>
            )
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}