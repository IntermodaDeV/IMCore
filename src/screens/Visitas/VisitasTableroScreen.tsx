import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner, useThemeName } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { ChevronLeft, ChevronRight, DoorOpen, CalendarDays, Building2, AlarmClockOff, X, LogIn, LogOut, Timer, Bot, Users, IdCard, Repeat } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IAgenda, IVisitaAcceso } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'
import {
  agruparPorDia, claveDia, cuandoAbre, deEmpresa, diaDeFila, empresasParaFiltrar,
  estadoInfo, estanAdentro, esHoy, etiquetaDia, etiquetaDiaLarga, fmtDuracionMin,
  fmtHora, fmtVentana, horarioDelCatalogo, inicialDia, listaPersonas, lunesDe,
  nombreO, numeroDia, proximas, quienVisita, rangoSemana, resumenEstado, semanaDe,
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
  // Filtro por empresa. Se aplica a TODO el tablero —«ahora mismo», «por llegar»
  // y la semana— y no solo a la lista de adentro: tocar «Chamer» y que el
  // calendario siguiera mostrando las de Intermoda sería peor que no filtrar.
  const [empresaSel, setEmpresaSel] = useState<string | null>(null)

  // Detalle: la fila que se tocó y los movimientos de su pase.
  const [sel, setSel] = useState<IAgenda | null>(null)
  const [accesos, setAccesos] = useState<IVisitaAcceso[]>([])
  const [cargandoAccesos, setCargandoAccesos] = useState(false)

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
        // Un fallo del servidor sin este aviso se ve igual que un día sin
        // visitas, y el tablero pasa de «no hay nadie» a mentir.
        if (!rSemana.Success || !rAhora.Success) {
          const msg = rSemana.ErrorMessage || rAhora.ErrorMessage || 'No se pudo cargar el tablero'
          showToast('error', 'Error', msg, 5000, 'bottom')
        }
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

  const abrir = async (f: IAgenda) => {
    setSel(f)
    setAccesos([])
    setCargandoAccesos(true)
    try {
      const r = await visitasService.getAccesos(f.Visita_Id)
      if (r.Success) setAccesos(r.Data ?? [])
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setCargandoAccesos(false)
  }

  // El endpoint devuelve los movimientos de TODO el pase; el detalle es de UNA
  // ventana. En un recurrente de lunes a viernes, no filtrar mostraría las
  // entradas de los otros cuatro días debajo de la ventana de este.
  //
  // Se filtra por VisitaDia_Id y no por fecha porque un día puede tener VARIAS
  // ventanas (el horario de mañana y tarde): por fecha, la ventana de la mañana
  // mostraría también la entrada de la tarde y no cuadraría con el tiempo
  // adentro de arriba, que es el de ESTA ventana. La fecha queda de respaldo
  // para los movimientos viejos, anteriores a los horarios, que no la tienen.
  const accesosDeLaVentana = useMemo(() => {
    if (!sel) return []
    const porVentana = accesos.filter(a => a.VisitaDia_Id === sel.VisitaDia_Id)
    if (porVentana.length > 0) return porVentana
    return accesos.filter(a => (a.AccessDate ?? '').slice(0, 10) === diaDeFila(sel))
  }, [accesos, sel])

  // Los chips salen de los datos SIN filtrar: si se calcularan sobre lo ya
  // filtrado, al elegir una empresa desaparecería la otra y no habría cómo
  // volver ni cómo cambiar.
  const empresas = useMemo(
    () => empresasParaFiltrar(filasAhora, filasSemana),
    [filasAhora, filasSemana]
  )

  const ahora = useMemo(() => deEmpresa(filasAhora, empresaSel), [filasAhora, empresaSel])
  const semana = useMemo(() => deEmpresa(filasSemana, empresaSel), [filasSemana, empresaSel])

  const adentro = useMemo(() => estanAdentro(ahora), [ahora])
  const porLlegar = useMemo(
    () => proximas(ahora.filter(f => (f.Dia ?? '').slice(0, 10) === hoy)),
    [ahora, hoy]
  )
  // Las tres cifras cuentan PERSONAS, no pases: la pregunta del guardia es
  // «cuánta gente hay», y un pase puede traer cinco. Las listas de abajo sí van
  // por visita, y por eso dicen «visitas» donde hace falta.
  const personas = (filas: IAgenda[]) => filas.reduce((s, f) => s + (f.PersonasCount || 1), 0)
  const personasAdentro = personas(adentro)
  const personasVencidas = personas(adentro.filter(f => f.Estado === 'Vencida'))
  const personasPorLlegar = personas(porLlegar)

  const porDia = useMemo(() => agruparPorDia(semana), [semana])
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

                {/* Por empresa: el número cuenta PERSONAS adentro, que es la
                    pregunta («cuánta gente de quién hay adentro»).
                    Tocar una filtra TODO el tablero; tocar la misma otra vez
                    quita el filtro. Con una sola empresa no se puede tocar: un
                    filtro que no cambia nada solo confunde. */}
                {empresas.length > 0 && (
                  <XStack flexWrap="wrap" gap="$2" marginTop="$1">
                    {empresas.map(e => {
                      const sel = empresaSel === e.code
                      const filtrable = empresas.length > 1
                      return (
                        <XStack
                          key={e.code}
                          alignItems="center"
                          gap="$1.5"
                          paddingVertical="$1.5"
                          paddingHorizontal="$2.5"
                          borderRadius={999}
                          backgroundColor={sel ? '$primary' : '$backgroundSurface'}
                          {...(filtrable
                            ? {
                                onPress: () => setEmpresaSel(sel ? null : e.code),
                                pressStyle: { opacity: 0.6 },
                              }
                            : {})}
                        >
                          <Building2 size={12} color={sel ? 'white' : '#94A3B8'} />
                          <Text fontSize={12} color={sel ? 'white' : '$text'} fontWeight="600">
                            {e.nombre}
                          </Text>
                          <Text fontSize={12} color={sel ? 'white' : '$textMuted'}>
                            {e.personas}
                          </Text>
                          {e.vencidas > 0 && (
                            <View
                              width={6}
                              height={6}
                              borderRadius={3}
                              backgroundColor={sel ? 'white' : estadoInfo('Vencida', isDark).color}
                            />
                          )}
                        </XStack>
                      )
                    })}

                    {/* Salida explícita del filtro. La pastilla marcada ya se
                        puede volver a tocar, pero eso hay que adivinarlo. */}
                    {empresaSel !== null && (
                      <XStack
                        alignItems="center"
                        gap="$1.5"
                        paddingVertical="$1.5"
                        paddingHorizontal="$2.5"
                        borderRadius={999}
                        borderWidth={1}
                        borderColor="$primary"
                        onPress={() => setEmpresaSel(null)}
                        pressStyle={{ opacity: 0.6 }}
                      >
                        <X size={12} color="#94A3B8" />
                        <Text fontSize={12} color="$primary" fontWeight="700">
                          Ver todas
                        </Text>
                      </XStack>
                    )}
                  </XStack>
                )}

                {adentro.length === 0 ? (
                  // Con filtro puesto, «Nadie adentro» a secas se lee como que
                  // la planta está vacía, y puede haber gente de la otra empresa.
                  <Vacio
                    texto={
                      empresaSel
                        ? `Nadie de ${empresas.find(e => e.code === empresaSel)?.nombre ?? 'esa empresa'} adentro en este momento`
                        : 'Nadie adentro en este momento'
                    }
                  />
                ) : (
                  <YStack gap="$2" marginTop="$1">
                    {(verTodasAdentro ? adentro : adentro.slice(0, TOPE_ADENTRO)).map(f => (
                      <FilaAdentro key={f.VisitaDia_Id} f={f} isDark={isDark} onPress={() => abrir(f)} />
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
                      <FilaProxima key={f.VisitaDia_Id} f={f} isDark={isDark} onPress={() => abrir(f)} />
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
                      <FilaDia key={f.VisitaDia_Id} f={f} isDark={isDark} onPress={() => abrir(f)} />
                    ))}
                  </YStack>
                )}
              </Tarjeta>
            </YStack>
          </ScrollView>
        )}
      </YStack>

      {/* ─────────────── DETALLE ───────────────
          Se abre desde cualquiera de las tres listas. Lo que trae de nuevo
          respecto a la fila: los acompañantes completos (en la fila se cortan),
          el estado explicado en una frase con sus números, y los movimientos
          reales del día. */}
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.5)" justifyContent="flex-end">
          <YStack
            backgroundColor="$backgroundPage"
            borderTopLeftRadius="$6"
            borderTopRightRadius="$6"
            padding="$4"
            gap="$3"
            maxHeight="92%"
          >
            {sel && (
              <>
                <XStack alignItems="center" gap="$2">
                  <View
                    paddingHorizontal="$2.5"
                    paddingVertical="$1"
                    borderRadius={999}
                    backgroundColor={estadoInfo(sel.Estado, isDark).color}
                  >
                    <Text fontSize={11} fontWeight="800" color="white">
                      {estadoInfo(sel.Estado, isDark).label.toUpperCase()}
                    </Text>
                  </View>
                  <View flex={1} />
                  <View onPress={() => setSel(null)} pressStyle={{ opacity: 0.6 }} padding="$1">
                    <X size={22} color="#94A3B8" />
                  </View>
                </XStack>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <YStack gap="$3" paddingBottom="$4">

                    {/* La frase que explica el estado con sus números. Es lo
                        que se viene a leer: el badge dice «Vencida», esto dice
                        desde cuándo y cuánto lleva de más. */}
                    <View
                      borderRadius="$3"
                      padding="$3"
                      borderLeftWidth={3}
                      borderLeftColor={estadoInfo(sel.Estado, isDark).color}
                      backgroundColor="$backgroundElevated"
                    >
                      <Text fontSize={13} color="$text" lineHeight={19}>
                        {resumenEstado(sel)}
                      </Text>
                    </View>

                    {/* Quiénes vienen. En la fila se cortan; acá van completos. */}
                    <YStack gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <Users size={15} color="#94A3B8" />
                        <Text fontSize={13} fontWeight="800" color="$text">
                          {sel.PersonasCount === 1 ? 'Visitante' : `Visitantes (${sel.PersonasCount})`}
                        </Text>
                      </XStack>
                      {listaPersonas(sel).length === 0 ? (
                        <Text fontSize={12} color="$textMuted">Sin nombres registrados</Text>
                      ) : (
                        listaPersonas(sel).map((n, i) => (
                          <Text key={`${n}-${i}`} fontSize={13} color="$text">
                            {n}
                          </Text>
                        ))
                      )}
                    </YStack>

                    <YStack gap="$1.5">
                      <Dato etiqueta="Empresa" valor={sel.Empresa ?? '—'} />
                      <Dato etiqueta="Visita a" valor={sel.VisitTo} />
                      <Dato
                        etiqueta="Motivo"
                        valor={
                          sel.Motivo === 'Otros' && sel.VisitReasonOther
                            ? sel.VisitReasonOther
                            : sel.Motivo
                        }
                      />
                      <Dato etiqueta="Día" valor={etiquetaDiaLarga(diaDeFila(sel))} />
                      {/* La VENTANA son las horas concretas de este día, que es
                          lo que portería hace cumplir. El HORARIO es la
                          plantilla del catálogo de la que salieron, y solo se
                          muestra si de verdad se usó una: antes se pintaba
                          «Día completo» cuando no había ninguna, y contradecía
                          a la ventana de arriba. */}
                      <Dato etiqueta="Puede entrar" valor={fmtVentana(sel.VentanaInicio, sel.VentanaFin)} />
                      {!!horarioDelCatalogo(sel) && (
                        <Dato etiqueta="Horario" valor={horarioDelCatalogo(sel) as string} />
                      )}
                    </YStack>

                    {/* Documento: lo que le toca vigilar a portería. Si el pase
                        lo exige y no hay respaldo, se dice en rojo — es el dato
                        que después nadie puede reconstruir. */}
                    {sel.RequiereId && (
                      <XStack alignItems="center" gap="$2">
                        <IdCard
                          size={14}
                          color={sel.IdRespaldado ? '#94A3B8' : estadoInfo('Vencida', isDark).color}
                        />
                        <Text
                          fontSize={12}
                          fontWeight={sel.IdRespaldado ? '400' : '800'}
                          color={sel.IdRespaldado ? '$textMuted' : estadoInfo('Vencida', isDark).color}
                          flexShrink={1}
                        >
                          {sel.IdRespaldado
                            ? 'Documento respaldado'
                            : 'Pide documento y no hay ninguno respaldado'}
                          {sel.IdCadaEntrada ? ' · se pide en cada entrada' : ''}
                        </Text>
                      </XStack>
                    )}

                    {sel.IsRecurrent && (
                      <XStack alignItems="center" gap="$2">
                        <Repeat size={14} color="#94A3B8" />
                        <Text fontSize={12} color="$textMuted" flexShrink={1}>
                          Pase recurrente · este es uno de sus días
                        </Text>
                      </XStack>
                    )}

                    {/* Movimientos del DÍA (ver el filtro en accesosDeLaVentana) */}
                    <YStack gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <CalendarDays size={15} color="#94A3B8" />
                        <Text fontSize={13} fontWeight="800" color="$text">
                          Entradas y salidas
                        </Text>
                      </XStack>

                      {cargandoAccesos ? (
                        <Spinner color="$primary" />
                      ) : accesosDeLaVentana.length === 0 ? (
                        <Text fontSize={12} color="$textMuted">Todavía sin movimientos.</Text>
                      ) : (
                        accesosDeLaVentana.map(a => {
                          const exceso = a.MinutosExceso ?? 0
                          return (
                            <YStack
                              key={a.Id}
                              backgroundColor="$backgroundElevated"
                              borderRadius="$3"
                              padding="$2.5"
                              gap="$1.5"
                            >
                              <XStack alignItems="center" gap="$3">
                                <XStack alignItems="center" gap="$1">
                                  <LogIn size={13} color="#2E9E5B" />
                                  <Text fontSize={12} color="#2E9E5B" fontWeight="700">
                                    {fmtHora(a.EntradaAt)}
                                  </Text>
                                </XStack>
                                <XStack alignItems="center" gap="$1">
                                  <LogOut size={13} color={a.SalidaAt ? '#2563EB' : '#94A3B8'} />
                                  <Text
                                    fontSize={12}
                                    fontWeight="700"
                                    color={a.SalidaAt ? '#2563EB' : '#94A3B8'}
                                  >
                                    {a.SalidaAt ? fmtHora(a.SalidaAt) : 'sigue adentro'}
                                  </Text>
                                </XStack>
                                <View flex={1} />
                                {a.MinutosDentro != null && (
                                  <XStack alignItems="center" gap="$1">
                                    <Timer size={11} color="#94A3B8" />
                                    <Text fontSize={11} color="$textMuted">
                                      {fmtDuracionMin(a.MinutosDentro)}
                                    </Text>
                                  </XStack>
                                )}
                              </XStack>

                              {(exceso > 0 || a.CierreAuto || !!a.EntradaBy) && (
                                <XStack alignItems="center" gap="$2" flexWrap="wrap">
                                  {exceso > 0 && (
                                    <XStack alignItems="center" gap="$1">
                                      <AlarmClockOff size={10} color={estadoInfo('ConExceso', isDark).color} />
                                      <Text
                                        fontSize={10}
                                        fontWeight="700"
                                        color={estadoInfo('ConExceso', isDark).color}
                                      >
                                        +{fmtDuracionMin(exceso)} fuera de horario
                                      </Text>
                                    </XStack>
                                  )}
                                  {/* Una salida que nadie escaneó no es el mismo
                                      dato que una escaneada: hay que poder
                                      distinguirlas. */}
                                  {a.CierreAuto && (
                                    <XStack alignItems="center" gap="$1">
                                      <Bot size={10} color="#64748B" />
                                      <Text fontSize={10} fontWeight="700" color="#64748B">
                                        cierre automático
                                      </Text>
                                    </XStack>
                                  )}
                                  {/* Nombre de persona, no el código de usuario:
                                      un guardia no tiene por qué traducir
                                      'rmartinez'. El servidor lo resuelve; si
                                      la API todavía es la vieja y no manda el
                                      nombre, cae al código. */}
                                  {!!a.EntradaBy && (
                                    <Text fontSize={10} color="$textMuted" flexShrink={1}>
                                      registró {nombreO(a.EntradaByNombre, a.EntradaBy)}
                                      {a.SalidaBy && a.SalidaBy !== a.EntradaBy
                                        ? ` / salida ${nombreO(a.SalidaByNombre, a.SalidaBy)}`
                                        : ''}
                                    </Text>
                                  )}
                                </XStack>
                              )}
                            </YStack>
                          )
                        })
                      )}
                    </YStack>

                    {!!sel.Create_By && (
                      <Text fontSize={11} color="$textMuted">
                        Pase generado por {nombreO(sel.CreadoPor, sel.Create_By)}
                        {sel.Creation_Date ? ` · ${(sel.Creation_Date ?? '').slice(8, 10)}/${(sel.Creation_Date ?? '').slice(5, 7)}/${(sel.Creation_Date ?? '').slice(0, 4)}` : ''}
                      </Text>
                    )}
                  </YStack>
                </ScrollView>
              </>
            )}
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <XStack gap="$2" alignItems="flex-start">
      <Text fontSize={12} color="$textMuted" width={78}>
        {etiqueta}
      </Text>
      <Text fontSize={12} color="$text" flex={1} fontWeight="600">
        {valor}
      </Text>
    </XStack>
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
function FilaAdentro({ f, isDark, onPress }: { f: IAgenda; isDark: boolean; onPress: () => void }) {
  const info = estadoInfo(f.Estado, isDark)
  const excedido = f.Estado === 'Vencida'
  return (
    <XStack alignItems="center" gap="$2.5" onPress={onPress} pressStyle={{ opacity: 0.55 }}>
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
function FilaProxima({ f, isDark, onPress }: { f: IAgenda; isDark: boolean; onPress: () => void }) {
  const enVentana = f.MinutosParaIniciar <= 0
  const color = enVentana ? estadoInfo('Vencida', isDark).color : '$textMuted'
  return (
    <XStack alignItems="center" gap="$2.5" onPress={onPress} pressStyle={{ opacity: 0.55 }}>
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
function FilaDia({ f, isDark, onPress }: { f: IAgenda; isDark: boolean; onPress: () => void }) {
  const info = estadoInfo(f.Estado, isDark)
  return (
    <XStack alignItems="center" gap="$2.5" onPress={onPress} pressStyle={{ opacity: 0.55 }}>
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
