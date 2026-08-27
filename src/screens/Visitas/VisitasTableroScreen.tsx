import React, { useCallback, useMemo, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner, useThemeName } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { ChevronLeft, ChevronRight, DoorOpen, CalendarDays, Building2, AlarmClockOff } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IAgenda } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'
import {
  adentroPorEmpresa, agruparPorDia, claveDia, cuandoAbre, estadoInfo, estanAdentro,
  esHoy, etiquetaDia, fmtDuracionMin, fmtHora, fmtVentana, inicialDia, lunesDe,
  numeroDia, proximas, quienVisita, rangoSemana, semanaDe,
} from './agenda'

// Tablero de Visitas en la app.
//
// NO es el tablero del web recortado: es el mismo dato con otro recorte. En la
// pantalla de portería cabe la cuadrícula del mes; en un teléfono no se lee, y
// lo que sirve en la mano de un guardia son dos preguntas —¿quién está adentro
// ahora? y ¿quién viene?—. El calendario se sirve como una tira de siete días
// con el detalle del día que se toque.
//
// Los ESTADOS los calcula el servidor (Visitas.SP_GetAgenda). Ver agenda.ts.

/** Cuántos de los que están adentro se listan sin tocar «ver todas». Cuatro es
 *  lo que cabe sin empujar la semana fuera de la primera pantalla. */
const TOPE_ADENTRO = 4
/** Las próximas son un aviso, no un listado: con tres basta para saber si hay
 *  que estar pendiente. El resto está en la tira de la semana. */
const TOPE_PROXIMAS = 3

export default function VisitasTableroScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const isDark = useThemeName() === 'dark'

  const hoy = claveDia(new Date())

  // La semana visible se mueve con las flechas; «ahora mismo» NO se mueve con
  // ella: el guardia tiene que poder ver quién está adentro aunque esté
  // mirando la semana pasada. Por eso son dos consultas y no una.
  const [lunes, setLunes] = useState<Date>(() => lunesDe(new Date()))
  const [diaSel, setDiaSel] = useState<string>(hoy)

  const [filasSemana, setFilasSemana] = useState<IAgenda[]>([])
  const [filasAhora, setFilasAhora] = useState<IAgenda[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [verTodasAdentro, setVerTodasAdentro] = useState(false)

  const dias = useMemo(() => semanaDe(lunes), [lunes])

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Tablero
      </Text>
    ),
    right: <NotificationBell size={20} />,
  })

  const load = useCallback(
    async (silent = false) => {
      if (!user?.Code) return
      if (!silent) setLoading(true)
      try {
        const semana = semanaDe(lunes)
        // «Ahora mismo» pide AYER y hoy, no solo hoy: una ventana nocturna que
        // abrió anoche tiene Dia = ayer, y quien sigue adentro a las 2 a.m. se
        // perdería del conteo justo cuando más importa saber que está.
        const ayer = new Date()
        ayer.setDate(ayer.getDate() - 1)

        const [rSemana, rAhora] = await Promise.all([
          visitasService.getAgenda(user.Code, semana[0], semana[6]),
          visitasService.getAgenda(user.Code, claveDia(ayer), hoy),
        ])
        if (rSemana.Success) setFilasSemana(rSemana.Data ?? [])
        if (rAhora.Success) setFilasAhora(rAhora.Data ?? [])
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
      }
      setLoading(false)
      setRefreshing(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.Code, lunes]
  )

  // Recarga al enfocar: se vuelve acá después de registrar una entrada o salida
  // en Validar, y el tablero tiene que reflejarlo. La 1ra vez con spinner; las
  // siguientes en silencio para no parpadear.
  const primera = useRef(true)
  useFocusEffect(
    useCallback(() => {
      load(!primera.current)
      primera.current = false
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  )

  const adentro = useMemo(() => estanAdentro(filasAhora), [filasAhora])
  const porEmpresa = useMemo(() => adentroPorEmpresa(filasAhora), [filasAhora])
  const porLlegar = useMemo(
    () => proximas(filasAhora.filter(f => (f.Dia ?? '').slice(0, 10) === hoy)),
    [filasAhora, hoy]
  )
  // Las tres cifras cuentan PERSONAS, no pases: la pregunta del guardia es
  // «cuánta gente hay», y un pase puede traer cinco. Las listas de abajo sí van
  // por visita, y por eso dicen «visitas» donde hace falta.
  const personas = (filas: IAgenda[]) => filas.reduce((s, f) => s + (f.PersonasCount || 1), 0)
  const personasAdentro = personas(adentro)
  const personasVencidas = personas(adentro.filter(f => f.Estado === 'Vencida'))
  const personasPorLlegar = personas(porLlegar)

  const porDia = useMemo(() => agruparPorDia(filasSemana), [filasSemana])
  const delDia = porDia[diaSel] ?? []

  const moverSemana = (delta: number) => {
    const nuevo = new Date(lunes)
    nuevo.setDate(lunes.getDate() + delta * 7)
    setLunes(nuevo)
    // Al cambiar de semana la selección cae en su lunes: dejar seleccionado un
    // día de la semana anterior mostraría una lista que ya no corresponde a la
    // tira de arriba.
    setDiaSel(claveDia(nuevo))
  }

  const semanaTieneHoy = dias.includes(hoy)

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
        {loading ? (
          <YStack flex={1} justifyContent="center" alignItems="center">
            <Spinner size="large" color="$primary" />
          </YStack>
        ) : (
          <ScrollView
            flex={1}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  load(true)
                }}
                tintColor="#FF551A"
              />
            }
          >
            <YStack padding="$4" gap="$3" paddingBottom="$6">

              {/* ─────────────── AHORA MISMO ─────────────── */}
              <Tarjeta>
                <XStack alignItems="center" gap="$2">
                  <DoorOpen size={16} color="#94A3B8" />
                  <Text fontSize={13} fontWeight="800" color="$text" flex={1}>
                    Ahora mismo
                  </Text>
                  <Text fontSize={11} color="$textMuted">
                    {horaLocal()}
                  </Text>
                </XStack>

                <XStack alignItems="center" marginTop="$1">
                  <Cifra n={personasAdentro} etiqueta="adentro" color={estadoInfo('EnPlanta', isDark).color} />
                  <Separador />
                  <Cifra
                    n={personasVencidas}
                    etiqueta={personasVencidas === 1 ? 'se le venció' : 'se les venció'}
                    color={personasVencidas > 0 ? estadoInfo('Vencida', isDark).color : undefined}
                  />
                  <Separador />
                  <Cifra n={personasPorLlegar} etiqueta="por llegar" color={estadoInfo('Programada', isDark).color} />
                </XStack>

                {/* Por empresa: la pregunta es «cuánta gente de quién hay
                    adentro», así que se cuentan PERSONAS y no pases. */}
                {porEmpresa.length > 0 && (
                  <XStack flexWrap="wrap" gap="$2" marginTop="$1">
                    {porEmpresa.map(e => (
                      <XStack
                        key={e.code}
                        alignItems="center"
                        gap="$1.5"
                        paddingVertical="$1.5"
                        paddingHorizontal="$2.5"
                        borderRadius={999}
                        backgroundColor="$backgroundSurface"
                      >
                        <Building2 size={12} color="#94A3B8" />
                        <Text fontSize={12} color="$text" fontWeight="600">
                          {e.nombre}
                        </Text>
                        <Text fontSize={12} color="$textMuted">
                          {e.personas}
                        </Text>
                        {e.vencidas > 0 && (
                          <View
                            width={6}
                            height={6}
                            borderRadius={3}
                            backgroundColor={estadoInfo('Vencida', isDark).color}
                          />
                        )}
                      </XStack>
                    ))}
                  </XStack>
                )}

                {adentro.length === 0 ? (
                  <Vacio texto="Nadie adentro en este momento" />
                ) : (
                  <YStack gap="$2" marginTop="$1">
                    {(verTodasAdentro ? adentro : adentro.slice(0, TOPE_ADENTRO)).map(f => (
                      <FilaAdentro key={f.VisitaDia_Id} f={f} isDark={isDark} />
                    ))}
                    {adentro.length > TOPE_ADENTRO && (
                      <Text
                        fontSize={12}
                        color="$primary"
                        fontWeight="700"
                        onPress={() => setVerTodasAdentro(v => !v)}
                        pressStyle={{ opacity: 0.6 }}
                      >
                        {verTodasAdentro ? 'Ver menos' : `Ver las ${adentro.length} visitas`}
                      </Text>
                    )}
                  </YStack>
                )}
              </Tarjeta>

              {/* ─────────────── POR LLEGAR ───────────────
                  Solo aparece si hay algo. Una tarjeta que dice «nada» todos
                  los días entrena a no mirarla. */}
              {porLlegar.length > 0 && (
                <Tarjeta>
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize={13} fontWeight="800" color="$text" flex={1}>
                      Por llegar hoy
                    </Text>
                    <Text fontSize={11} color="$textMuted">
                      {porLlegar.filter(f => f.MinutosParaIniciar <= 0).length > 0
                        ? `${porLlegar.filter(f => f.MinutosParaIniciar <= 0).length} en ventana`
                        : cuandoAbre(porLlegar[0].MinutosParaIniciar)}
                    </Text>
                  </XStack>
                  <YStack gap="$2" marginTop="$1">
                    {porLlegar.slice(0, TOPE_PROXIMAS).map(f => (
                      <FilaProxima key={f.VisitaDia_Id} f={f} isDark={isDark} />
                    ))}
                    {porLlegar.length > TOPE_PROXIMAS && (
                      <Text fontSize={11} color="$textMuted">
                        y {porLlegar.length - TOPE_PROXIMAS} más en la semana
                      </Text>
                    )}
                  </YStack>
                </Tarjeta>
              )}

              {/* ─────────────── SEMANA ───────────────
                  El calendario del web, servido como tira de días: en un
                  teléfono la cuadrícula del mes no se lee. */}
              <Tarjeta>
                <XStack alignItems="center" gap="$2">
                  <CalendarDays size={16} color="#94A3B8" />
                  <Text fontSize={13} fontWeight="800" color="$text" flex={1}>
                    {rangoSemana(dias)}
                  </Text>
                  {!semanaTieneHoy && (
                    <Text
                      fontSize={11}
                      color="$primary"
                      fontWeight="700"
                      onPress={() => {
                        setLunes(lunesDe(new Date()))
                        setDiaSel(hoy)
                      }}
                      pressStyle={{ opacity: 0.6 }}
                    >
                      Hoy
                    </Text>
                  )}
                  <Flecha Icon={ChevronLeft} onPress={() => moverSemana(-1)} />
                  <Flecha Icon={ChevronRight} onPress={() => moverSemana(1)} />
                </XStack>

                <XStack gap="$1.5" marginTop="$1">
                  {dias.map(d => {
                    const filas = porDia[d] ?? []
                    const alerta = filas.some(f => f.Estado === 'Vencida' || f.Estado === 'ConExceso')
                    const sel = d === diaSel
                    return (
                      <YStack
                        key={d}
                        flex={1}
                        alignItems="center"
                        paddingVertical="$2"
                        borderRadius="$3"
                        gap={2}
                        backgroundColor={sel ? '$primary' : 'transparent'}
                        borderWidth={1}
                        borderColor={sel ? '$primary' : esHoy(d) ? '$primary' : 'transparent'}
                        onPress={() => setDiaSel(d)}
                        pressStyle={{ opacity: 0.6 }}
                      >
                        <Text fontSize={10} color={sel ? 'white' : '$textMuted'}>
                          {inicialDia(d)}
                        </Text>
                        <Text fontSize={15} fontWeight="700" color={sel ? 'white' : '$text'}>
                          {numeroDia(d)}
                        </Text>
                        {/* El contador solo aparece si el día tiene algo: una
                            fila de ceros es ruido en siete columnas. */}
                        {filas.length > 0 ? (
                          <Text
                            fontSize={10}
                            fontWeight="700"
                            color={
                              sel ? 'white' : alerta ? estadoInfo('Vencida', isDark).color : '$textMuted'
                            }
                          >
                            {filas.length}
                          </Text>
                        ) : (
                          <Text fontSize={10} color="transparent">
                            ·
                          </Text>
                        )}
                      </YStack>
                    )
                  })}
                </XStack>

                <XStack alignItems="center" gap="$2" marginTop="$1">
                  <Text fontSize={12} fontWeight="700" color="$text" flex={1}>
                    {etiquetaDia(diaSel)}
                    {esHoy(diaSel) ? ' · hoy' : ''}
                  </Text>
                  <Text fontSize={11} color="$textMuted">
                    {delDia.length === 0
                      ? ''
                      : `${delDia.length} ${delDia.length === 1 ? 'visita' : 'visitas'}`}
                  </Text>
                </XStack>

                {delDia.length === 0 ? (
                  <Vacio texto="Sin visitas ese día" />
                ) : (
                  <YStack gap="$2">
                    {delDia.map(f => (
                      <FilaDia key={f.VisitaDia_Id} f={f} isDark={isDark} />
                    ))}
                  </YStack>
                )}
              </Tarjeta>
            </YStack>
          </ScrollView>
        )}
      </YStack>
    </Page>
  )
}

/** 'HH:MM' del reloj del teléfono. No se usa toISOString: eso es UTC y en
 *  Honduras pintaría seis horas de más en el encabezado. */
const horaLocal = () =>
  new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })

// ── Piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$4"
      gap="$2"
      overflow="hidden"
      shadowColor="#000"
      shadowOffset={{ width: 0, height: 2 }}
      shadowOpacity={0.07}
      shadowRadius={6}
      elevation={2}
    >
      {children}
    </YStack>
  )
}

function Cifra({ n, etiqueta, color }: { n: number; etiqueta: string; color?: string }) {
  return (
    <YStack flex={1} alignItems="center" gap={1}>
      <Text fontSize={22} fontWeight="800" color={color ?? '$text'}>
        {n}
      </Text>
      <Text fontSize={10} color="$textMuted" textAlign="center">
        {etiqueta}
      </Text>
    </YStack>
  )
}

const Separador = () => <View width={1} height={26} backgroundColor="$backgroundSurface" />

function Flecha({ Icon, onPress }: { Icon: any; onPress: () => void }) {
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.5 }} padding="$1">
      <Icon size={18} color="#94A3B8" />
    </View>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <Text fontSize={12} color="$textMuted" paddingVertical="$2">
      {texto}
    </Text>
  )
}

/** Quien está adentro: lo que se necesita saber es desde cuándo y si ya se pasó. */
function FilaAdentro({ f, isDark }: { f: IAgenda; isDark: boolean }) {
  const info = estadoInfo(f.Estado, isDark)
  const excedido = f.Estado === 'Vencida'
  return (
    <XStack alignItems="center" gap="$2.5">
      <View width={3} height={30} borderRadius={2} backgroundColor={info.color} />
      <YStack flex={1} minWidth={0} gap={1}>
        <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
          {quienVisita(f)}
        </Text>
        <Text fontSize={11} color="$textMuted" numberOfLines={1}>
          {f.Empresa ? `${f.Empresa} · ` : ''}
          desde {fmtHora(f.PrimeraEntrada)}
        </Text>
      </YStack>
      {excedido ? (
        <XStack alignItems="center" gap="$1" flexShrink={0}>
          <AlarmClockOff size={12} color={info.color} />
          <Text fontSize={11} fontWeight="800" color={info.color}>
            +{fmtDuracionMin(f.MinutosExcesoEnCurso)}
          </Text>
        </XStack>
      ) : (
        <Text fontSize={11} color="$textMuted" flexShrink={0}>
          {fmtDuracionMin(f.MinutosDentroTotal)}
        </Text>
      )}
    </XStack>
  )
}

/** Por llegar: la distancia importa más que la hora exacta. */
function FilaProxima({ f, isDark }: { f: IAgenda; isDark: boolean }) {
  const enVentana = f.MinutosParaIniciar <= 0
  const color = enVentana ? estadoInfo('Vencida', isDark).color : '$textMuted'
  return (
    <XStack alignItems="center" gap="$2.5">
      <View width={3} height={30} borderRadius={2} backgroundColor={estadoInfo('Programada', isDark).color} />
      <YStack flex={1} minWidth={0} gap={1}>
        <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
          {quienVisita(f)}
        </Text>
        <Text fontSize={11} color="$textMuted" numberOfLines={1}>
          {f.Empresa ? `${f.Empresa} · ` : ''}
          {fmtVentana(f.VentanaInicio, f.VentanaFin)}
        </Text>
      </YStack>
      <Text fontSize={11} fontWeight={enVentana ? '800' : '400'} color={color} flexShrink={0}>
        {enVentana ? 'sin llegar' : cuandoAbre(f.MinutosParaIniciar)}
      </Text>
    </XStack>
  )
}

/** Fila del día elegido en la semana: el estado en palabras, que acá sí hace
 *  falta (una lista de días mezcla programadas, finalizadas y no presentadas). */
function FilaDia({ f, isDark }: { f: IAgenda; isDark: boolean }) {
  const info = estadoInfo(f.Estado, isDark)
  return (
    <XStack alignItems="center" gap="$2.5">
      <View width={3} height={30} borderRadius={2} backgroundColor={info.color} />
      <YStack flex={1} minWidth={0} gap={1}>
        <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
          {quienVisita(f)}
        </Text>
        <Text fontSize={11} color="$textMuted" numberOfLines={1}>
          {f.Empresa ? `${f.Empresa} · ` : ''}
          {fmtVentana(f.VentanaInicio, f.VentanaFin)}
        </Text>
      </YStack>
      <Text fontSize={11} fontWeight="700" color={info.color} flexShrink={0}>
        {info.corto}
      </Text>
    </XStack>
  )
}
