import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, View, Button, useTheme } from 'tamagui'
import { BarChart, PieChart } from 'react-native-gifted-charts'
import {
  BarChart3,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Minus,
  PiggyBank,
  Utensils,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeBudgetEmployee,
  IOvertimeBudgetRow,
  IOvertimeBudgetTotals,
  IOvertimeDayTotal,
  IOvertimeMealAreaRow,
  IOvertimeMealBudget,
  IOvertimeMealDay,
  IOvertimeMealEmployee,
  IOvertimeMealWeek,
  IOvertimeTopEmployee,
  IOvertimeTopEmployeeDay,
  IOvertimeTopRequester,
  IOvertimeWeekRange,
  IOvertimeWeekTotal,
  IPayWebWeek,
} from '../../api/modules/overtime/overtime.types'
import { SkeletonBox } from '../../components/Skeletons/SkeletonList'
import { shadows } from '../../theme/shadows'
import { ACCENT } from '../Mantenimiento/mantenimiento.helpers'
import { DistribucionHoras, fmtHoras, nombreConCodigo, parseConceptos } from './Overtime.utils'

/**
 * El nombre para un renglón angosto: nombre y primer apellido.
 *
 * 'DANIA SUYAPA CANALES REYES' no entra en media pantalla, y recortarlo por
 * caracteres deja 'Dania Suyapa C…', que no distingue a dos hermanas. Con la
 * primera palabra y el primer apellido —la penúltima, porque las dos últimas
 * son los apellidos— se reconoce a la persona.
 *
 * Sabe si tiene uno o dos nombres: con tres palabras el apellido es la segunda,
 * con cuatro es la tercera. El nombre completo con su código sigue estando en
 * los diálogos.
 */
const nombreCorto = (valor: string): string => {
  const texto = String(valor ?? '')
  const sinCodigo = texto.includes(' - ') ? texto.slice(texto.indexOf(' - ') + 3) : texto

  const partes = sinCodigo.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''

  const capitalizar = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

  if (partes.length <= 2) return partes.map(capitalizar).join(' ')

  return `${capitalizar(partes[0])} ${capitalizar(partes[partes.length - 2])}`
}

// Tablero de HORAS EXTRA.
//
// Tres secciones sobre el mismo período: el presupuesto de horas extra, el de
// alimentación y quiénes las hacen. Son las mismas tres del tablero web, con
// los mismos nombres, para que quien mire las dos pantallas no tenga que
// traducir.
//
// QUÉ SE VE Y QUÉ NO
//
// Solo las áreas que el usuario tiene configuradas en sus parámetros
// (OT_AUTH_AREAS), y eso lo resuelve el procedimiento, no esta pantalla. Quien
// administra un departamento ve el presupuesto de SUS centros de costo, no el
// de toda su unidad de negocios, aunque la unidad aparezca como agrupador.
//
// Y solo lo APROBADO por todas las entidades. Lo pedido pero sin firmar no
// compromete presupuesto: contarlo inflaría el consumo con solicitudes que
// quizá terminen rechazadas, y este tablero se usa para decidir si se autorizan
// más horas.
//
// EN CONSTRUCCIÓN
//
// Los gráficos se van migrando uno por uno desde el tablero web, que es donde
// ya están armados. Presupuesto HE y Alimentación están completas —el total, el
// reparto por área, el día por día y el comparativo de semanas— y Empleados va
// por su primera tarjeta.
//
// CADA TARJETA PIDE LO SUYO. El filtro de semana es de la pantalla, pero la
// consulta es de cada tarjeta: así una puede refrescarse sin volver a pedir las
// demás, y la más lenta no retiene a las otras. Es la misma división que hace
// el tablero web, y del otro lado hay un endpoint por tarjeta.
//
// La versión anterior de esta pantalla —presupuesto por nivel, gasto por día y
// reparto por banda, con react-native-gifted-charts— está en el historial de
// git si hace falta volver a mirar cómo se resolvió algo.

const SECCIONES = [
  { key: 'presupuesto', label: 'Presupuesto HE' },
  { key: 'alimentacion', label: 'Alimentación' },
  { key: 'empleados', label: 'Empleados' },
] as const

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`

/**
 * Los mismos tres colores del tablero web, para que las dos pantallas se lean
 * igual: naranja lo gastado, verde lo que queda, rojo cuando se pasó.
 */
const COLOR_GASTADO = '#F97316'
/**
 * El verde de las HORAS por empleado.
 *
 * Mismo tono que el disponible del presupuesto, pero con otro nombre a
 * propósito: allá el verde quiere decir 'lo que queda' y acá no se mide consumo
 * de presupuesto, se cuentan horas. Es el mismo color que usa el tablero web en
 * su gráfico de empleados.
 */
const COLOR_HORAS = '#22C55E'
/**
 * El mismo naranja, apagado.
 *
 * Se usa para el CONTEXTO: los días que no son el mayor, las semanas que no son
 * la actual, y lo que hizo el resto de la gente. Nunca para el dato principal.
 */
const COLOR_GASTADO_SUAVE = '#FDBA74'
const COLOR_DISPONIBLE = '#22C55E'
const COLOR_EXCEDIDO = '#EF4444'

/**
 * Lempiras SIN decimales.
 *
 * El web los muestra con centavos; acá no caben. Tres montos con centavos en un
 * renglón de teléfono obligan a recortar el número, y 'L 53,89…' es peor que
 * 'L 53,892'. En un tablero el centavo es ruido de todos modos.
 */
const fmtDinero = (valor: number | null | undefined): string =>
  `L ${Math.round(Number(valor ?? 0)).toLocaleString('es-HN')}`

/**
 * El porcentaje con UN decimal, igual que el tablero web.
 *
 * Redondeado a entero mentía en los números chicos: un consumo del 0.8% se
 * mostraba como '1%', que es un 25% más de lo real. Con un decimal el número
 * es honesto y además ocupa poco, así que la letra puede quedar en su tamaño
 * en lugar de encogerse para hacerle lugar.
 */
const fmtPct = (pct: number | null | undefined) => `${Number(pct ?? 0).toFixed(1)}%`

/**
 * La fecha de 'YYYY-MM-DD' como fecha LOCAL.
 *
 * `new Date('2026-09-08')` la interpreta como UTC y en Honduras eso cae el día
 * anterior a las 18:00, así que el lunes se rotulaba domingo. Partiendo el
 * texto a mano no hay zona horaria que corra nada.
 */
const fechaLocal = (valor: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''))
  if (!m) return null

  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const diaCorto = (valor: string): string => {
  const d = fechaLocal(valor)
  return d ? DIAS_CORTOS[d.getDay()] : ''
}

/** '08/09' */
const fechaCorta = (valor: string): string => {
  const d = fechaLocal(valor)
  if (!d) return ''

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')

  return `${dd}/${mm}`
}

/**
 * Los tres cortes del árbol de centros de costo.
 *
 * Las etiquetas son más cortas que las del web —'Unidades' y no 'Unidades de
 * negocio'— porque las tres pastillas tienen que entrar en un renglón de
 * teléfono. El título de la tarjeta sí lleva el nombre completo, así que no se
 * pierde de qué corte se trata.
 */
/**
 * Con qué corte abren las tarjetas de tres divisiones.
 *
 * DEPARTAMENTO y no unidad de negocio: una unidad es demasiado grande para que
 * el reparto diga algo —salen dos o tres columnas gigantes— y el centro de
 * costos es demasiado fino para una primera mirada en un teléfono. El
 * departamento es el corte donde el reparto se lee y sigue siendo accionable.
 */
const NIVEL_INICIAL = 'department' as const

const CORTES = [
  {
    nivel: 'businessUnit',
    pastilla: 'Unidades',
    titulo: 'Presupuesto por unidad de negocio',
    tituloAlimentacion: 'Alimentación por unidad de negocio',
    tituloTop: 'Empleado con más horas extra por unidad de negocio',
  },
  {
    nivel: 'department',
    pastilla: 'Departamentos',
    titulo: 'Presupuesto por departamento',
    tituloAlimentacion: 'Alimentación por departamento',
    tituloTop: 'Empleado con más horas extra por departamento',
  },
  {
    nivel: 'costCenter',
    pastilla: 'Centros',
    titulo: 'Presupuesto por centro de costo',
    tituloAlimentacion: 'Alimentación por centro de costo',
    tituloTop: 'Empleado con más horas extra por centro de costo',
  },
] as const

type NivelCorte = (typeof CORTES)[number]['nivel']

/**
 * Etiqueta de una columna: el CÓDIGO.
 *
 * Acá NO se puede hacer lo que hace el web, que pone el nombre recortado y
 * girado. Debajo de una columna de 34px caben unos pocos caracteres, así que
 * 'COSTURA DENIM' y 'COSTURA DRILL' se recortaban al mismo 'COSTURA D…' y
 * dejaban de distinguirse. El código es corto y único, y el nombre completo
 * está en el desglose que abre al tocar.
 */
const etiquetaArea = (fila: IOvertimeBudgetRow): string => fila.Codigo || '—'

// Medidas de las columnas: un RANGO, no un valor fijo.
//
// Con tres áreas se quieren columnas anchas y con veinte no caben ni finas, así
// que la medida se calcula (ver `medidasColumnas`): se empieza por el máximo y
// se adelgaza hasta el mínimo para que entren todas. Pasado el mínimo ya se
// deja que el gráfico haga scroll: más finas dejarían de leerse.
/**
 * Cuántas semanas admite el comparativo.
 *
 * SEIS es el tope, y es una decisión de la pantalla del teléfono: son seis
 * pares de columnas —gastado y disponible— en el ancho de un celular, y a
 * partir de ahí las barras entran en el mínimo y los rótulos empiezan a
 * pisarse. El tablero web permite más porque tiene el ancho.
 *
 * Arranca en CINCO —la actual y cuatro atrás—, que es el mismo valor con el que
 * abre el web.
 */
const SEMANAS_MIN = 2
const SEMANAS_MAX = 6
const SEMANAS_INICIAL = 5

/**
 * Las semanas que TERMINAN en la actual, listas para pedir.
 *
 * Lo usan los dos comparativos —horas extra y alimentación— y por eso vive
 * afuera: es la misma regla, y copiada en cada tarjeta un arreglo habría que
 * hacerlo dos veces.
 *
 * Si el calendario no trajera ninguna marcada como actual —pasa cuando se piden
 * todas y hoy cae en una futura— se toma la más reciente que ya empezó, que es
 * la que se está gastando.
 */
const semanasHastaLaActual = (
  calendario: IPayWebWeek[],
  cuantas: number,
): IOvertimeWeekRange[] => {
  if (calendario.length === 0) return []

  const hoy = new Date()
  const hoyKey =
    `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}` +
    `-${String(hoy.getDate()).padStart(2, '0')}`

  const lista = calendario
    .map(w => ({
      Inicio: String(w.InitialDate ?? '').substring(0, 10),
      Fin: String(w.FinalDate ?? '').substring(0, 10),
      actual: w.IsCurrentWeek === true,
    }))
    .filter(w => w.Inicio && w.Fin)
    // 'YYYY-MM-DD' se ordena como texto sin ambigüedad, así que no hace falta
    // construir fechas. Y el orden importa: el calendario llega de la más
    // reciente a la más vieja.
    .sort((a, b) => a.Inicio.localeCompare(b.Inicio))

  const iActual = lista.findIndex(w => w.actual)
  const corte =
    iActual >= 0
      ? iActual
      : lista.reduce((ultima, w, i) => (w.Inicio <= hoyKey ? i : ultima), -1)

  if (corte < 0) return []

  return lista
    .slice(Math.max(0, corte - (cuantas - 1)), corte + 1)
    .map(({ Inicio, Fin }) => ({ Inicio, Fin }))
}

/**
 * Los tramos de una columna apilada, sin los que miden cero.
 *
 * Un tramo en cero deja un borde redondeado flotando sobre el eje, así que se
 * descartan. Pero la columna no puede quedarse SIN tramos: la librería lee
 * `stacks[0].barWidth` sin preguntar y un arreglo vacío la revienta con
 * 'Cannot read property barWidth of undefined'. Por eso, cuando no queda
 * ninguno, va uno en cero.
 */
const tramosApilados = <T extends { value: number }>(tramos: T[]): T[] => {
  const conValor = tramos.filter(t => t.value > 0)

  return conValor.length > 0 ? conValor : [tramos[0]]
}

const BAR_W_MAX = 34
const BAR_W_MIN = 12
const BAR_SPACING_MAX = 20
const BAR_SPACING_MIN = 6
const BAR_INITIAL = 12
const CHART_H = 190

/**
 * Ancho que se reserva para los rótulos del eje Y.
 *
 * IMPORTANTE: en esta librería `width` es el ancho del ÁREA DE COLUMNAS y NO
 * incluye esta franja. Pasarle el ancho de la tarjeta entera es lo que hacía
 * que el gráfico se saliera por la derecha con muchos centros de costo: medía
 * 44px más de lo que la tarjeta podía mostrar.
 */
const Y_LABEL_W = 40

/**
 * Cuánto mide cada columna para que quepan todas —y si no caben, cuánto mide
 * el contenido.
 *
 * El reparto entre barra y espacio se adelgaza PROPORCIONALMENTE: bajando solo
 * el espacio las columnas quedaban pegadas y el apilado se leía como una sola
 * mancha; bajando solo la barra quedaban hilos separados por aire.
 *
 * Los dos tienen piso propio. Por debajo de esos pisos no se sigue apretando:
 * ahí es mejor el scroll, porque una columna de 8px con 2px de aire no se
 * distingue de la de al lado ni se puede tocar con un dedo.
 */
const medidasColumnas = (areas: number, anchoVisible: number) => {
  const plot = Math.max(140, anchoVisible - Y_LABEL_W)
  const n = Math.max(1, areas)

  // Lo que le tocaría a cada columna —barra más su espacio— si todas tuvieran
  // que entrar en el ancho visible.
  const disponible = (plot - BAR_INITIAL) / n
  const ideal = BAR_W_MAX + BAR_SPACING_MAX

  const factor = Math.min(1, disponible / ideal)

  const barW = Math.max(BAR_W_MIN, Math.round(BAR_W_MAX * factor))
  const spacing = Math.max(BAR_SPACING_MIN, Math.round(BAR_SPACING_MAX * factor))

  const contenido = n * (barW + spacing) + BAR_INITIAL

  return {
    plot,
    barW,
    spacing,
    /** Ya no se puede adelgazar más: de acá en adelante, scroll. */
    scroll: contenido > plot,
    /**
     * Con columnas apretadas el código no entra debajo de la suya y se monta
     * sobre el vecino. Girarlo es lo mismo que hace el tablero web con los
     * nombres largos.
     */
    girar: barW + spacing < 26,
  }
}

export default function DashboardHorasExtraScreen() {
  const { defaultCompany } = useAuth()

  const companyCode = defaultCompany?.Code ?? ''

  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [seccion, setSeccion] = useState(0)

  /**
   * Qué secciones ya se abrieron alguna vez.
   *
   * Sirve para NO desmontar lo que ya se cargó. Cada tarjeta pide sus datos al
   * montarse, así que con las secciones renderizadas por condición —una u
   * otra— volver a una ya vista la montaba de nuevo y repetía las cuatro
   * consultas. El tablero web no hace eso: allá las tarjetas siguen existiendo
   * y solo se ocultan.
   *
   * Pero tampoco se montan las TRES de entrada: una sección que nadie abrió no
   * tiene por qué consultar nada. Se monta al primer toque y de ahí en adelante
   * se queda, escondida con `display: none`.
   *
   * Para volver a pedir están el refrescar de cada tarjeta y el desliz de la
   * pantalla, que es como se pide de nuevo a propósito.
   */
  const [visitadas, setVisitadas] = useState<number[]>([0])

  const cambiarSeccion = useCallback((i: number) => {
    setSeccion(i)
    setVisitadas(previas => (previas.includes(i) ? previas : [...previas, i]))
  }, [])

  /**
   * Contador de refrescos.
   *
   * Cada tarjeta pide LO SUYO y se recarga sola cuando cambia la semana. Pero
   * deslizar hacia abajo o volver a entrar a la pantalla tiene que refrescar
   * todas, y si la semana elegida no cambió, sus dependencias tampoco: sin este
   * contador el gesto recargaba el calendario y dejaba los números viejos.
   */
  const [refrescoId, setRefrescoId] = useState(0)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Tablero de Horas Extra
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  // Última semana con la que se pidieron datos. Cuando haya gráficos, es lo que
  // evita que un cambio de sección vuelva a pedir lo que ya está en pantalla.
  const semanaCargadaRef = useRef<string>('')

  // ── Semanas ───────────────────────────────────────────────────────────────
  /**
   * El calendario de PLANILLA, no el natural: la semana de horas extra la
   * define ese calendario y es la misma que filtra las pantallas web.
   *
   * LANZA si falla, y eso es el punto. Antes se tragaba el error —una respuesta
   * con Success en false dejaba la lista vacía sin avisar—, la semana nunca se
   * elegía y la pantalla quedaba en el esqueleto para siempre. Sin error visible
   * no había ni botón de reintentar ni forma de deslizar.
   *
   * Devuelve la semana elegida para que quien llama siga de largo sin esperar a
   * que el estado se propague.
   */
  const loadSemanas = useCallback(async () => {
    if (!companyCode) return { lista: [] as IPayWebWeek[], elegida: null as IPayWebWeek | null }

    const res = await overtimeService.getCalendarWeeks(companyCode)

    if (!res?.Success) {
      throw new Error(res?.ErrorMessage || 'No se pudo cargar el calendario de semanas.')
    }

    const lista = res.Data ?? []
    setSemanas(lista)

    // Se conserva la semana elegida si sigue existiendo; si no, la que está en
    // curso, que es "lo que llevo gastado" hoy.
    const previa = lista.find(w => claveSemana(w) === semanaCargadaRef.current)
    const elegida = previa ?? lista.find(w => w.IsCurrentWeek) ?? lista[lista.length - 1] ?? null

    setSemana(elegida ? claveSemana(elegida) : '')
    semanaCargadaRef.current = elegida ? claveSemana(elegida) : ''

    return { lista, elegida }
  }, [companyCode])

  const semanaSel = useMemo(
    () => semanas.find(w => claveSemana(w) === semana) ?? null,
    [semanas, semana],
  )

  const recargarTodo = useCallback(async () => {
    if (!companyCode) return
    setError(null)

    try {
      await loadSemanas()
      setRefrescoId(n => n + 1)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
  }, [companyCode, loadSemanas])

  /**
   * Se recarga cada vez que se ENTRA a la pantalla, no solo al montarla.
   *
   * La navegación deja la pantalla montada, así que sin esto el tablero se
   * quedaría con los números de la primera visita. Entre una entrada y otra
   * alguien pudo haber aprobado horas, y un presupuesto que muestra el estado de
   * hace media hora induce justo al error que este tablero existe para evitar.
   */
  useFocusEffect(
    useCallback(() => {
      setCargando(true)
      recargarTodo()
    }, [recargarTodo]),
  )

  /** Deslizar hacia abajo rehace exactamente lo mismo que entrar a la pantalla. */
  const onRefresh = useCallback(() => {
    setRefrescando(true)
    recargarTodo()
  }, [recargarTodo])

  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return <ErrorState title={error.title} message={error.message} onRetry={onRefresh} />
  }

  return (
    // El gris va en la PANTALLA y no solo en la banda: si el área que desliza
    // se quedara blanca, las tarjetas —que también son blancas— seguirían sin
    // borde y el gris de arriba se leería como un encabezado suelto.
    <YStack flex={1} backgroundColor="$backgroundSurface">
      {/* ── LOS DOS CONTROLES, FIJOS ────────────────────────────────────
          Van FUERA del ScrollView, así que no se van con el desliz. Son los
          dos datos que dicen qué se está mirando —qué semana y qué sección— y
          con cuatro tarjetas abajo se perdían de vista al primer desliz: para
          cambiar de semana había que subir hasta arriba, y peor todavía, los
          números de la mitad de la pantalla quedaban sin decir de cuándo son.

          El filtro de semana es de las TRES secciones —es el período que todas
          comparten— y por eso va arriba del selector y no dentro de ninguna.

          No hay superposición ni z-index: esto y el ScrollView son dos filas
          de una columna, no una capa sobre la otra.

          FONDO GRIS Y UNA LÍNEA ABAJO, y esto sí hace falta. En el tema claro
          `background` y `backgroundElevated` son los DOS blancos, así que la
          banda fija y las tarjetas quedaban del mismo color y lo único que las
          separaba era la sombra: al deslizar, las tarjetas parecían pasar por
          arriba de nada y se perdía dónde terminaba lo fijo.

          Con el gris de `backgroundSurface` la banda es otra superficie —en el
          tema oscuro también, porque ahí las tarjetas son más claras que ese
          gris— y con eso alcanza: se probó además con una línea abajo y sobraba,
          porque el gris ya separa y la línea quedaba como un subrayado suelto a
          media pantalla. */}
      <YStack
        paddingHorizontal={12}
        paddingTop={12}
        paddingBottom={12}
        gap={12}
        backgroundColor="$backgroundSurface"
      >
        {semanas.length > 0 && (
          <SelectorSemana
            semanas={semanas}
            actual={semanaSel}
            onCambiar={w => setSemana(claveSemana(w))}
          />
        )}

        <SelectorSeccion activo={seccion} onCambiar={cambiarSeccion} />
      </YStack>

      {/* El área que desliza lleva el MISMO gris que la banda: así las
          tarjetas blancas son lo único que resalta en la pantalla. */}
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
      >
        {cargando && !refrescando ? (
          <EsqueletoSeccion />
        ) : semanas.length === 0 ? (
          // Sin calendario no hay período que consultar. Antes esto quedaba
          // como un esqueleto eterno; ahora se dice y se puede reintentar
          // deslizando.
          <EmptyState
            title="Sin calendario de semanas"
            message="No se pudo cargar el calendario de planilla, así que no hay semana que consultar. Deslice hacia abajo para reintentar."
          />
        ) : (
          <>
            {/* Cada sección se monta la primera vez que se abre y de ahí en
                adelante se queda: escondida con `display: none`, pero viva.
                Así volver a una ya vista no repite sus consultas. Ver la nota
                de `visitadas`. */}
            {visitadas.includes(0) && (
              <YStack gap={12} display={seccion === 0 ? 'flex' : 'none'}>
                <TarjetaPresupuesto
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaAreas
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaDias
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                {/* Esta NO recibe la semana del filtro: siempre termina en la
                    actual. Ver la nota del componente. */}
                <TarjetaSemanas
                  companyCode={companyCode}
                  calendario={semanas}
                  refrescoId={refrescoId}
                />
              </YStack>
            )}

            {visitadas.includes(1) && (
              <YStack gap={12} display={seccion === 1 ? 'flex' : 'none'}>
                <TarjetaAlimentacion
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaAlimentacionAreas
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaAlimentacionDias
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                {/* Esta NO recibe la semana del filtro: siempre termina en la
                    actual, igual que su par de horas extra. */}
                <TarjetaAlimentacionSemanas
                  companyCode={companyCode}
                  calendario={semanas}
                  refrescoId={refrescoId}
                />
              </YStack>
            )}

            {visitadas.includes(2) && (
              <YStack gap={12} display={seccion === 2 ? 'flex' : 'none'}>
                {/* EL SOLICITANTE VA PRIMERO, al revés que en el web.
                    En una pantalla que se recorre deslizando, el primer bloque
                    es el único que se ve sin moverse, y de las dos listas la
                    que se accionaba es esta: la de empleados dice quién se
                    quedó, y esta dice a quién preguntarle por qué. */}
                <TarjetaSolicitantes
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaEmpleados
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaTopPorArea
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />

                <TarjetaTopPorDia
                  companyCode={companyCode}
                  inicio={semanaSel?.InitialDate?.substring(0, 10)}
                  fin={semanaSel?.FinalDate?.substring(0, 10)}
                  refrescoId={refrescoId}
                />
              </YStack>
            )}
          </>
        )}
      </ScrollView>
    </YStack>
  )
}

// ── 1. Presupuesto total asignado ───────────────────────────────────────────
//
// Cuánto del presupuesto de la semana se lleva gastado. Las tres cifras y una
// dona, igual que la primera tarjeta del tablero web.
//
// LAS CIFRAS VAN ARRIBA DE LA DONA y no en la leyenda: el monto es el dato que
// se viene a buscar y no se deduce de un gajo. La dona da la proporción, que es
// lo que un número solo no dice.
//
// Van en tres columnas con rótulo y no en una frase corrida —'L 5,209 de
// L 53,892, quedan L 48,683'— porque así hay que leerla dos veces para saber
// cuál es cuál, y el que importa quedaba último.
//
// PIDE LO SUYO. Se refresca cuando cambia la semana o cuando la pantalla se
// refresca completa, y tiene su propio esqueleto y su propio error: las
// tarjetas del tablero salen de consultas distintas y llegan cuando llegan. Con
// un esqueleto para toda la pantalla, la más lenta retiene a las demás.
function TarjetaPresupuesto({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [data, setData] = useState<IOvertimeBudgetTotals | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getBudgetTotals(companyCode, inicio, fin)

      // Una respuesta 200 con cuerpo vacío llega como null desde el cliente
      // HTTP. Sin esta guarda, leerle .Success revienta y lo que se ve es el
      // error genérico de 'algo pasó en la app', que no dice nada.
      if (!res) {
        setError('El servidor respondió vacío al pedir el presupuesto.')
        return
      }

      if (!res.Success || !res.Data) {
        setError(res.ErrorMessage || 'No se pudo cargar el presupuesto.')
        return
      }

      setData(res.Data)
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  // `refrescoId` está en las dependencias justamente para volver a pedir cuando
  // la pantalla se refresca sin que haya cambiado la semana.
  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  const presupuesto = Number(data?.Total_Presupuesto ?? 0)
  const gastado = Number(data?.Total_Costo ?? 0)
  const disponible = Number(data?.Total_Disponible ?? 0)
  const excedido = disponible < 0

  /** Sin presupuesto asignado no hay dona: no hay contra qué medir. */
  const sinPresupuesto = !presupuesto

  /**
   * Radio de la dona, acotado por arriba Y por abajo.
   *
   * Sale del ancho de pantalla para no quedar minúscula en una tablet, pero con
   * tope: sin él, en pantalla ancha la dona crecía hasta empujar la leyenda
   * fuera de la vista de un teléfono en horizontal.
   */
  const radio = Math.max(52, Math.min(68, (width - 56) / 4.2))

  const gajos = useMemo(() => {
    // Lo que QUEDA, no el presupuesto entero: los dos gajos tienen que sumar lo
    // asignado. Excedido va en cero —un gajo negativo no se puede dibujar— y
    // que se pasó lo dice el rojo y la cifra de arriba.
    const restante = Math.max(0, disponible)
    const total = gastado + restante

    const parte = (v: number) => (total ? (v * 100) / total : 0)

    return [
      {
        value: gastado,
        color: excedido ? COLOR_EXCEDIDO : COLOR_GASTADO,
        // Etiqueta solo en el gajo que la puede contener: en una dona de 60px
        // de radio, un '4%' en un gajo de esa medida se sale del arco y queda
        // montado sobre el otro. Los dos porcentajes están en la leyenda.
        text: parte(gastado) >= 12 ? fmtPct(parte(gastado)) : '',
      },
      {
        value: restante,
        color: COLOR_DISPONIBLE,
        text: parte(restante) >= 12 ? fmtPct(parte(restante)) : '',
      },
    ]
  }, [gastado, disponible, excedido])

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        <Text fontSize={12} fontWeight="800" color="$text" flex={1} numberOfLines={1}>
          Presupuesto de horas extra
        </Text>

        {/* Refrescar SOLO esta tarjeta. El de la pantalla completa es el gesto
            de deslizar; este existe para no volver a pedir las otras cuando lo
            único que se quiere es ver si ya entró una aprobación. */}
        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      {cargando ? (
        <EsqueletoPresupuesto radio={radio} />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : (
        <>
          {/* Las tres cifras, en el orden de la resta: asignado − gastado =
              disponible. */}
          <XStack borderTopWidth={1} borderBottomWidth={1} borderColor="$border">
            <CifraPresupuesto
              etiqueta="ASIGNADO"
              monto={fmtDinero(presupuesto)}
              detalle="de la semana"
            />
            <SeparadorVertical />
            <CifraPresupuesto
              etiqueta="GASTADO"
              monto={fmtDinero(gastado)}
              detalle={`${fmtHoras(data?.Total_Horas)} · ${fmtPct(data?.Total_Porcentaje_Consumido)}`}
              color={COLOR_GASTADO}
            />
            <SeparadorVertical />
            <CifraPresupuesto
              etiqueta={excedido ? 'EXCEDIDO' : 'DISPONIBLE'}
              // Sin signo: leer '-L 340' bajo la palabra 'Excedido' obliga a
              // interpretar dos veces. El rótulo ya dice cuál de los dos es.
              monto={fmtDinero(Math.abs(disponible))}
              detalle={excedido ? 'sobre lo asignado' : 'sin comprometer'}
              color={excedido ? COLOR_EXCEDIDO : COLOR_DISPONIBLE}
            />
          </XStack>

          {sinPresupuesto ? (
            /* Sin presupuesto configurado no hay dona: dos gajos en cero se ven
               igual que un gráfico roto, así que se dice con palabras. */
            <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
              <PiggyBank size={26} color="#94A3B8" />
              <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
                Tus áreas no tienen presupuesto asignado para esta semana.
              </Text>
              <Text fontSize={10} color="$textMuted" textAlign="center">
                Se gastaron {fmtDinero(gastado)} en {fmtHoras(data?.Total_Horas)}.
              </Text>
            </YStack>
          ) : (
            <YStack alignItems="center" gap="$2.5" paddingTop="$1">
              <PieChart
                donut
                data={gajos}
                radius={radio}
                /* Anillo GRUESO: el hueco es poco más de la mitad del radio.
                   Con un hueco más grande el anillo quedaba en una línea de
                   26px y los dos colores no se comparaban de un vistazo, que
                   es todo lo que esta dona tiene que hacer. Más abajo de esto
                   tampoco: el centro dejaría de tener lugar para su cifra. */
                innerRadius={radio * 0.52}
                innerCircleColor={theme.backgroundElevated?.val}
                showText
                textColor="#FFFFFF"
                textSize={11}
                /* Los dos porcentajes en negrita: van sobre naranja y sobre
                   verde, y en cuerpo normal a 10px el blanco se desdibujaba
                   contra el color. */
                fontWeight="bold"
                /* El porcentaje consumido en el centro: es la lectura de un
                   golpe, y el hueco de la dona es el único lugar donde cabe sin
                   competir con nada. */
                centerLabelComponent={() => (
                  <YStack alignItems="center">
                    <Text
                      fontSize={17}
                      fontWeight="800"
                      color={excedido ? COLOR_EXCEDIDO : '$text'}
                    >
                      {fmtPct(data?.Total_Porcentaje_Consumido)}
                    </Text>
                    <Text fontSize={9} color="$textMuted">
                      consumido
                    </Text>
                  </YStack>
                )}
              />


            </YStack>
          )}
        </>
      )}
    </YStack>
  )
}

// ── Alimentación 1. El presupuesto de la semana ─────────────────────────────
//
// La otra bolsa del MISMO cubo: mismo renglón, TipoCuenta 'ALIMENTACION'. Las
// dos nunca se suman —son presupuestos distintos y sumarlos daría un monto que
// nadie asignó—, por eso viven en pestañas separadas.
//
// MISMO DISEÑO que la dona de horas extra, a propósito: es la misma pregunta
// —cuánto tengo y cuánto llevo— sobre otra bolsa, y con otra forma habría que
// volver a aprender a leerla.
//
// LO QUE CAMBIA ES LA UNIDAD. El presupuesto viene en dinero pero lo otorgado
// se cuenta en RACIONES —una por revisión con la casilla marcada— y el puente
// entre las dos es el valor de la ración. Por eso el rótulo de lo gastado dice
// las dos cosas: el monto arriba y 'N raciones · L 35 c/u' abajo. Las raciones
// son lo que se puede ir a contrastar con el comedor; el monto es lo que se
// compara contra el presupuesto.
//
// El valor de la ración es UNO y vale para todos, a diferencia de la hora
// extra, que se paga al salario de cada uno. Y es el de HOY: si el precio
// cambia, el histórico se recostea. Sirve para comparar semanas con la misma
// vara, pero conviene saberlo antes de cuadrar una planilla vieja.
function TarjetaAlimentacion({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [data, setData] = useState<IOvertimeMealBudget | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getMealBudget(companyCode, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir el presupuesto de alimentación.')
        return
      }

      if (!res.Success || !res.Data) {
        setError(res.ErrorMessage || 'No se pudo cargar el presupuesto de alimentación.')
        return
      }

      setData(res.Data)
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  const presupuesto = Number(data?.Presupuesto ?? 0)
  const gastado = Number(data?.Costo ?? 0)
  const disponible = Number(data?.Disponible ?? 0)
  const raciones = Number(data?.Raciones ?? 0)
  const excedido = disponible < 0

  const sinPresupuesto = !presupuesto

  const radio = Math.max(52, Math.min(68, (width - 56) / 4.2))

  const gajos = useMemo(() => {
    const restante = Math.max(0, disponible)
    const total = gastado + restante

    const parte = (v: number) => (total ? (v * 100) / total : 0)

    return [
      {
        value: gastado,
        color: excedido ? COLOR_EXCEDIDO : COLOR_GASTADO,
        text: parte(gastado) >= 12 ? fmtPct(parte(gastado)) : '',
      },
      {
        value: restante,
        color: COLOR_DISPONIBLE,
        text: parte(restante) >= 12 ? fmtPct(parte(restante)) : '',
      },
    ]
  }, [gastado, disponible, excedido])

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        <Text fontSize={12} fontWeight="800" color="$text" flex={1} numberOfLines={1}>
          Presupuesto de alimentación
        </Text>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      {cargando ? (
        <EsqueletoPresupuesto radio={radio} />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : (
        <>
          <XStack borderTopWidth={1} borderBottomWidth={1} borderColor="$border">
            <CifraPresupuesto
              etiqueta="ASIGNADO"
              monto={fmtDinero(presupuesto)}
              detalle="de la semana"
            />
            <SeparadorVertical />
            <CifraPresupuesto
              etiqueta="OTORGADO"
              monto={fmtDinero(gastado)}
              // Las dos unidades: el monto arriba y en qué se traduce abajo.
              detalle={`${raciones} ${raciones === 1 ? 'ración' : 'raciones'}`}
              color={COLOR_GASTADO}
            />
            <SeparadorVertical />
            <CifraPresupuesto
              etiqueta={excedido ? 'EXCEDIDO' : 'DISPONIBLE'}
              monto={fmtDinero(Math.abs(disponible))}
              detalle={excedido ? 'sobre lo asignado' : 'sin comprometer'}
              color={excedido ? COLOR_EXCEDIDO : COLOR_DISPONIBLE}
            />
          </XStack>

          {sinPresupuesto ? (
            <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
              <Utensils size={26} color="#94A3B8" />
              <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
                Tus áreas no tienen presupuesto de alimentación para esta semana.
              </Text>
              {raciones > 0 && (
                <Text fontSize={10} color="$textMuted" textAlign="center">
                  Se otorgaron {raciones} {raciones === 1 ? 'ración' : 'raciones'} por{' '}
                  {fmtDinero(gastado)}.
                </Text>
              )}
            </YStack>
          ) : (
            <YStack alignItems="center" gap="$2.5" paddingTop="$1">
              <PieChart
                donut
                data={gajos}
                radius={radio}
                innerRadius={radio * 0.52}
                innerCircleColor={theme.backgroundElevated?.val}
                showText
                textColor="#FFFFFF"
                textSize={11}
                fontWeight="bold"
                centerLabelComponent={() => (
                  <YStack alignItems="center">
                    <Text
                      fontSize={17}
                      fontWeight="800"
                      color={excedido ? COLOR_EXCEDIDO : '$text'}
                    >
                      {fmtPct(data?.Porcentaje_Consumido)}
                    </Text>
                    <Text fontSize={9} color="$textMuted">
                      consumido
                    </Text>
                  </YStack>
                )}
              />
            </YStack>
          )}
        </>
      )}
    </YStack>
  )
}

// ── Alimentación 2. El presupuesto, repartido por área ──────────────────────
//
// Paralelo del reparto de horas extra sobre la otra bolsa, con las mismas
// columnas apiladas y los mismos colores: la columna completa es lo asignado al
// área y el tramo naranja lo otorgado.
//
// LO QUE CAMBIA ES LA UNIDAD: acá lo otorgado se cuenta en RACIONES, así que el
// filtro de 'qué áreas se dibujan' es por raciones y no por horas. Un área con
// raciones y sin presupuesto igual se ve —es un dato que hay que ir a corregir
// en el cubo, no un área sin movimiento—.
//
// Tocar una columna abre las raciones de esa área: quién, qué día y con qué
// horario. Una fila POR RACIÓN y no por empleado, porque alguien que recibió
// alimentación tres días son tres raciones y en el detalle hay que poder ver
// cuáles.
function TarjetaAlimentacionAreas({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [nivel, setNivel] = useState<NivelCorte>(NIVEL_INICIAL)
  const [filas, setFilas] = useState<IOvertimeMealAreaRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  const [areaAbierta, setAreaAbierta] = useState<IOvertimeMealAreaRow | null>(null)
  const [raciones, setRaciones] = useState<IOvertimeMealEmployee[]>([])
  const [cargandoRaciones, setCargandoRaciones] = useState(false)
  const [errorRaciones, setErrorRaciones] = useState<string>('')

  const corte = CORTES.find(c => c.nivel === nivel) ?? CORTES[0]

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getMealAreas(companyCode, nivel, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir la alimentación por área.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar la alimentación por área.')
        return
      }

      setFilas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, nivel, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  /** Las áreas que otorgaron alguna ración, de más a menos. */
  const conRaciones = useMemo(
    () =>
      filas
        .filter(f => Number(f.Raciones ?? 0) > 0)
        .sort((a, b) => Number(b.Raciones ?? 0) - Number(a.Raciones ?? 0)),
    [filas],
  )

  const sinMovimiento = filas.length - conRaciones.length

  const resumen = useMemo(() => {
    if (filas.length === 0) return null

    const otorgado = filas.reduce((acc, f) => acc + Number(f.Costo ?? 0), 0)
    const presupuesto = filas.reduce((acc, f) => acc + Number(f.Presupuesto ?? 0), 0)
    const total = filas.reduce((acc, f) => acc + Number(f.Raciones ?? 0), 0)

    return {
      otorgado,
      presupuesto,
      raciones: total,
      porcentaje: presupuesto > 0 ? (otorgado * 100) / presupuesto : 0,
      excedido: presupuesto > 0 && otorgado > presupuesto,
    }
  }, [filas])

  const anchoTarjeta = width - 48

  const medidas = useMemo(
    () => medidasColumnas(conRaciones.length, anchoTarjeta),
    [conRaciones.length, anchoTarjeta],
  )

  const abrirArea = useCallback(
    async (fila: IOvertimeMealAreaRow) => {
      if (!companyCode || !fila.Codigo) return

      setAreaAbierta(fila)
      setRaciones([])
      setErrorRaciones('')
      setCargandoRaciones(true)

      try {
        const res = await overtimeService.getMealEmployees(
          companyCode,
          inicio,
          fin,
          fila.Codigo,
          nivel,
        )

        if (!res) {
          setErrorRaciones('El servidor respondió vacío al pedir las raciones del área.')
          return
        }

        if (!res.Success) {
          setErrorRaciones(res.ErrorMessage || 'No se pudo cargar el detalle.')
          return
        }

        setRaciones(res.Data ?? [])
      } catch (err: any) {
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorRaciones(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message} (${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoRaciones(false)
      }
    },
    [companyCode, nivel, inicio, fin],
  )

  const cerrarArea = useCallback(() => {
    setAreaAbierta(null)
    setRaciones([])
    setErrorRaciones('')
  }, [])

  const columnas = useMemo(
    () =>
      conRaciones.map(f => {
        const otorgado = Number(f.Costo ?? 0)
        const disponible = Number(f.Disponible ?? 0)

        return {
          label: f.Codigo || '—',
          onPress: () => abrirArea(f),
          stacks: tramosApilados([
            { value: Math.max(otorgado, otorgado > 0 ? 1 : 0), color: COLOR_GASTADO },
            { value: Math.max(0, disponible), color: COLOR_DISPONIBLE },
            { value: Math.max(0, -disponible), color: COLOR_EXCEDIDO },
          ]),
        }
      }),
    [conRaciones, abrirArea],
  )

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            {corte.tituloAlimentacion}
          </Text>
          {!cargando && conRaciones.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Toque una columna para ver sus raciones
            </Text>
          )}
        </YStack>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>


      <SelectorCorte activo={nivel} cargando={cargando} onCambiar={setNivel} />

      {cargando ? (
        <EsqueletoColumnas />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : conRaciones.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <Utensils size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Ninguna de tus áreas otorgó alimentación esta semana.
          </Text>
          {sinMovimiento > 0 && (
            <Text fontSize={10} color="$textMuted" textAlign="center">
              {sinMovimiento} {sinMovimiento === 1 ? 'área' : 'áreas'} sin movimiento.
            </Text>
          )}
        </YStack>
      ) : (
        <>
          <View width={anchoTarjeta} overflow="hidden">
            <BarChart
              stackData={columnas}
              width={medidas.plot}
              disableScroll={!medidas.scroll}
              height={CHART_H}
              barWidth={medidas.barW}
              spacing={medidas.spacing}
              initialSpacing={BAR_INITIAL}
              noOfSections={4}
              yAxisLabelWidth={Y_LABEL_W}
              yAxisTextStyle={{ fontSize: 9, color: muted }}
              labelWidth={medidas.barW + medidas.spacing}
              rotateLabel={medidas.girar}
              xAxisLabelTextStyle={{ fontSize: 8, color: muted }}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={grid}
              rulesColor={grid}
              rulesType="dashed"
              formatYLabel={(valor: string) => {
                const n = Number(valor)
                if (!n) return '0'
                return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
              }}
              onPress={(_item: any, index: number) => {
                const fila = conRaciones[index]
                if (fila) abrirArea(fila)
              }}
            />
          </View>

          <XStack gap="$3" justifyContent="center" flexWrap="wrap">
            <TramoLeyenda color={COLOR_GASTADO} etiqueta="Otorgado" />
            <TramoLeyenda color={COLOR_DISPONIBLE} etiqueta="Disponible" />
            {conRaciones.some(f => Number(f.Disponible ?? 0) < 0) && (
              <TramoLeyenda color={COLOR_EXCEDIDO} etiqueta="Excedido" />
            )}
          </XStack>
        </>
      )}

      <DesgloseRaciones
        abierto={!!areaAbierta}
        titulo={areaAbierta?.Nombre || areaAbierta?.Codigo || ''}
        subtitulo={
          areaAbierta
            ? `${corte.tituloAlimentacion} · ${areaAbierta.Codigo} · ${areaAbierta.Empleados} empleado(s)`
            : ''
        }
        raciones={raciones}
        cargando={cargandoRaciones}
        error={errorRaciones}
        vacio="Esta área no otorgó alimentación en el período."
        onCerrar={cerrarArea}
      />
    </YStack>
  )
}

// ── Alimentación 3. Las raciones, día por día ───────────────────────────────
//
// La dona dice CUÁNTO se otorgó en la semana; esto dice CUÁNDO. Es la misma
// pregunta que el gasto por día de horas extra sobre la otra bolsa.
//
// LAS BARRAS SE MIDEN CONTRA EL DÍA DE MÁS RACIONES y no contra el presupuesto:
// el del cubo es semanal, y repartirlo entre siete sería inventar un número que
// nadie asignó. Acá se viene a ver el reparto de la semana.
//
// El monto va en el eje pero el dato que se lee es la RACIÓN: por eso el
// tooltip de cada día —el diálogo— cuenta raciones, y el resumen de arriba
// también.
function TarjetaAlimentacionDias({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [dias, setDias] = useState<IOvertimeMealDay[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  const [diaAbierto, setDiaAbierto] = useState<IOvertimeMealDay | null>(null)
  const [raciones, setRaciones] = useState<IOvertimeMealEmployee[]>([])
  const [cargandoRaciones, setCargandoRaciones] = useState(false)
  const [errorRaciones, setErrorRaciones] = useState<string>('')

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getMealDays(companyCode, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir la alimentación por día.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar la alimentación por día.')
        return
      }

      setDias(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  const maxCosto = useMemo(
    () => dias.reduce((m, d) => Math.max(m, Number(d.Costo ?? 0)), 0),
    [dias],
  )

  const totales = useMemo(
    () =>
      dias.reduce(
        (acc, d) => ({
          costo: acc.costo + Number(d.Costo ?? 0),
          raciones: acc.raciones + Number(d.Raciones ?? 0),
        }),
        { costo: 0, raciones: 0 },
      ),
    [dias],
  )

  const sinRaciones = dias.length > 0 && maxCosto === 0

  /**
   * Abre las raciones de un día.
   *
   * Sin código de área: la gente de un día viene de varias y el corte es la
   * fecha. El procedimiento trata la ausencia como 'todas las del alcance'.
   */
  const abrirDia = useCallback(
    async (dia: IOvertimeMealDay) => {
      const fecha = String(dia?.Fecha ?? '').substring(0, 10)
      if (!companyCode || !fecha) return

      setDiaAbierto(dia)
      setRaciones([])
      setErrorRaciones('')
      setCargandoRaciones(true)

      try {
        const res = await overtimeService.getMealEmployees(companyCode, fecha, fecha)

        if (!res) {
          setErrorRaciones('El servidor respondió vacío al pedir las raciones del día.')
          return
        }

        if (!res.Success) {
          setErrorRaciones(res.ErrorMessage || 'No se pudo cargar el detalle del día.')
          return
        }

        setRaciones(res.Data ?? [])
      } catch (err: any) {
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorRaciones(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message} (${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoRaciones(false)
      }
    },
    [companyCode],
  )

  const cerrarDia = useCallback(() => {
    setDiaAbierto(null)
    setRaciones([])
    setErrorRaciones('')
  }, [])

  const anchoTarjeta = width - 48

  const medidas = useMemo(
    () => medidasColumnas(dias.length, anchoTarjeta),
    [dias.length, anchoTarjeta],
  )

  const barras = useMemo(
    () =>
      dias.map(d => ({
        value: Number(d.Costo ?? 0),
        label: `${diaCorto(d.Fecha)}\n${fechaCorta(d.Fecha)}`,
        // El día de más raciones en naranja fuerte y el resto apagado: es el
        // que motiva la pregunta.
        frontColor:
          maxCosto > 0 && Number(d.Costo ?? 0) === maxCosto ? COLOR_GASTADO : COLOR_GASTADO_SUAVE,
        onPress: () => abrirDia(d),
      })),
    [dias, maxCosto, abrirDia],
  )

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  const mayorDelDia = diaAbierto?.Top_Centro
    ? `${diaAbierto.Top_Centro} — ${diaAbierto.Top_Centro_Raciones ?? 0} ${
        (diaAbierto.Top_Centro_Raciones ?? 0) === 1 ? 'ración' : 'raciones'
      }`
    : ''

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            Alimentación por día
          </Text>
          {!cargando && !sinRaciones && dias.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Toque un día para ver sus raciones
            </Text>
          )}
        </YStack>

        <XStack alignItems="center" gap="$1.5" flexShrink={0}>
          {!cargando && !error && dias.length > 0 && (
            <YStack alignItems="flex-end">
              <Text fontSize={12} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
                {fmtDinero(totales.costo)}
              </Text>
              <Text fontSize={9} color="$textMuted">
                {totales.raciones} {totales.raciones === 1 ? 'ración' : 'raciones'}
              </Text>
            </YStack>
          )}

          <View
            padding="$1.5"
            borderRadius={999}
            opacity={cargando ? 0.35 : 1}
            pressStyle={cargando ? undefined : { opacity: 0.5 }}
            onPress={cargando ? undefined : cargar}
          >
            <RefreshCw size={14} color="#94A3B8" />
          </View>
        </XStack>
      </XStack>

      {cargando ? (
        <EsqueletoDias />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : dias.length === 0 || sinRaciones ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <Utensils size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            No se otorgó alimentación ningún día de esta semana.
          </Text>
          <Text fontSize={10} color="$textMuted" textAlign="center" lineHeight={14}>
            Solo cuentan las revisiones ya aprobadas con la casilla marcada.
          </Text>
        </YStack>
      ) : (
        <View width={anchoTarjeta} overflow="hidden">
          <BarChart
            data={barras}
            width={medidas.plot}
            disableScroll={!medidas.scroll}
            height={CHART_H}
            barWidth={medidas.barW}
            spacing={medidas.spacing}
            initialSpacing={BAR_INITIAL}
            noOfSections={4}
            barBorderTopLeftRadius={3}
            barBorderTopRightRadius={3}
            /* Un día con una sola ración no se dibujaría y se leería como un
               día sin alimentación, que no es lo mismo. */
            minHeight={2}
            yAxisLabelWidth={Y_LABEL_W}
            yAxisTextStyle={{ fontSize: 9, color: muted }}
            labelWidth={medidas.barW + medidas.spacing}
            xAxisLabelTextStyle={{ fontSize: 8, color: muted, textAlign: 'center' }}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={grid}
            rulesColor={grid}
            rulesType="dashed"
            formatYLabel={(valor: string) => {
              const n = Number(valor)
              if (!n) return '0'
              return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
            }}
            onPress={(_item: any, index: number) => {
              const dia = dias[index]
              if (dia) abrirDia(dia)
            }}
          />
        </View>
      )}

      <DesgloseRaciones
        abierto={!!diaAbierto}
        titulo={diaAbierto ? `${diaCorto(diaAbierto.Fecha)} ${fechaCorta(diaAbierto.Fecha)}` : ''}
        subtitulo={
          diaAbierto
            ? `${diaAbierto.Raciones} ${diaAbierto.Raciones === 1 ? 'ración' : 'raciones'} · ${diaAbierto.Empleados} empleado(s)`
            : ''
        }
        destacado={mayorDelDia}
        destacadoRotulo="MÁS RACIONES DEL DÍA"
        raciones={raciones}
        cargando={cargandoRaciones}
        error={errorRaciones}
        vacio="Ese día no se otorgó alimentación en sus áreas."
        onCerrar={cerrarDia}
      />
    </YStack>
  )
}

// ── Alimentación 4. La semana contra las anteriores ─────────────────────────
//
// Mismo criterio que su par de horas extra: la última columna es SIEMPRE la
// semana en curso y no la del filtro, porque la comparación es contra el
// presente. Dos columnas por semana —lo otorgado y lo que queda— y no apiladas,
// porque apiladas todas medirían el presupuesto y una semana gastada se vería
// igual que una intacta.
//
// OJO CON LOS MONTOS VIEJOS: el valor de la ración es uno solo y es el de HOY,
// así que todas las semanas quedan costeadas al precio actual. Es lo que se
// quiere para comparar —la misma vara para todas— pero si el precio cambió en
// el medio, los montos de las semanas viejas no son los que se pagaron.
function TarjetaAlimentacionSemanas({
  companyCode,
  calendario,
  refrescoId,
}: {
  companyCode: string
  calendario: IPayWebWeek[]
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [cuantas, setCuantas] = useState(SEMANAS_INICIAL)
  const [semanas, setSemanas] = useState<IOvertimeMealWeek[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  const [abierta, setAbierta] = useState<IOvertimeMealWeek | null>(null)
  const [raciones, setRaciones] = useState<IOvertimeMealEmployee[]>([])
  const [cargandoRaciones, setCargandoRaciones] = useState(false)
  const [errorRaciones, setErrorRaciones] = useState<string>('')

  const rangos = useMemo(() => semanasHastaLaActual(calendario, cuantas), [calendario, cuantas])

  const cargar = useCallback(async () => {
    if (!companyCode) return

    if (rangos.length === 0) {
      setSemanas([])
      setCargando(false)
      return
    }

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getMealWeeks(companyCode, rangos)

      if (!res) {
        setError('El servidor respondió vacío al pedir el comparativo.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar el comparativo.')
        return
      }

      setSemanas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, rangos])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  const numeroDeSemana = useCallback(
    (inicio: string): string => {
      const key = String(inicio ?? '').substring(0, 10)
      const w = calendario.find(x => String(x.InitialDate ?? '').substring(0, 10) === key)

      return w ? `S${w.WeekNumber}` : fechaCorta(key)
    },
    [calendario],
  )

  const esActual = useCallback(
    (inicio: string): boolean => {
      const key = String(inicio ?? '').substring(0, 10)

      return calendario.some(
        w => w.IsCurrentWeek === true && String(w.InitialDate ?? '').substring(0, 10) === key,
      )
    },
    [calendario],
  )

  const abrirSemana = useCallback(
    async (semana: IOvertimeMealWeek) => {
      const desde = String(semana?.Inicio ?? '').substring(0, 10)
      const hasta = String(semana?.Fin ?? '').substring(0, 10)
      if (!companyCode || !desde || !hasta) return

      setAbierta(semana)
      setRaciones([])
      setErrorRaciones('')
      setCargandoRaciones(true)

      try {
        const res = await overtimeService.getMealEmployees(companyCode, desde, hasta)

        if (!res) {
          setErrorRaciones('El servidor respondió vacío al pedir las raciones de la semana.')
          return
        }

        if (!res.Success) {
          setErrorRaciones(res.ErrorMessage || 'No se pudo cargar el detalle de la semana.')
          return
        }

        setRaciones(res.Data ?? [])
      } catch (err: any) {
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorRaciones(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message} (${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoRaciones(false)
      }
    },
    [companyCode],
  )

  const cerrarSemana = useCallback(() => {
    setAbierta(null)
    setRaciones([])
    setErrorRaciones('')
  }, [])

  const anchoTarjeta = width - 48

  // Cada semana ocupa DOS columnas, así que para el ancho cuenta doble.
  const medidas = useMemo(
    () => medidasColumnas(semanas.length * 2, anchoTarjeta),
    [semanas.length, anchoTarjeta],
  )

  const barras = useMemo(() => {
    const salida: any[] = []

    semanas.forEach(s => {
      const otorgado = Number(s.Costo ?? 0)
      const presupuesto = Number(s.Presupuesto ?? 0)
      const excedido = presupuesto > 0 && otorgado > presupuesto
      const actual = esActual(s.Inicio)

      salida.push({
        value: otorgado,
        frontColor: excedido ? COLOR_EXCEDIDO : actual ? COLOR_GASTADO : COLOR_GASTADO_SUAVE,
        label: numeroDeSemana(s.Inicio),
        spacing: 2,
        onPress: () => abrirSemana(s),
      })

      salida.push({
        value: Math.max(0, presupuesto - otorgado),
        frontColor: COLOR_DISPONIBLE,
        onPress: () => abrirSemana(s),
      })
    })

    return salida
  }, [semanas, esActual, numeroDeSemana, abrirSemana])

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  const mayorDeLaSemana = abierta?.Top_Centro
    ? `${abierta.Top_Centro} — ${abierta.Top_Centro_Raciones ?? 0} ${
        (abierta.Top_Centro_Raciones ?? 0) === 1 ? 'ración' : 'raciones'
      }`
    : ''

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            Comparativo de las últimas semanas
          </Text>
          <Text fontSize={9} color="$textMuted">
            Siempre termina en la semana actual
          </Text>
        </YStack>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      <SelectorCuantasSemanas valor={cuantas} onCambiar={setCuantas} />

      {cargando ? (
        <EsqueletoSemanas />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : semanas.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Sin semanas anteriores con las que comparar.
          </Text>
        </YStack>
      ) : (
        <>
          <View width={anchoTarjeta} overflow="hidden">
            <BarChart
              data={barras}
              width={medidas.plot}
              disableScroll={!medidas.scroll}
              height={CHART_H}
              barWidth={medidas.barW}
              spacing={medidas.spacing + 6}
              initialSpacing={BAR_INITIAL}
              noOfSections={4}
              barBorderTopLeftRadius={3}
              barBorderTopRightRadius={3}
              minHeight={2}
              yAxisLabelWidth={Y_LABEL_W}
              yAxisTextStyle={{ fontSize: 9, color: muted }}
              xAxisLabelTextStyle={{ fontSize: 8, color: muted }}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={grid}
              rulesColor={grid}
              rulesType="dashed"
              formatYLabel={(valor: string) => {
                const n = Number(valor)
                if (!n) return '0'
                return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
              }}
              onPress={(_item: any, index: number) => {
                const semana = semanas[Math.floor(index / 2)]
                if (semana) abrirSemana(semana)
              }}
            />
          </View>

          <XStack gap="$3" justifyContent="center" flexWrap="wrap">
            <TramoLeyenda color={COLOR_GASTADO} etiqueta="Otorgado" />
            <TramoLeyenda color={COLOR_DISPONIBLE} etiqueta="Disponible" />
            {semanas.some(
              s =>
                Number(s.Presupuesto ?? 0) > 0 &&
                Number(s.Costo ?? 0) > Number(s.Presupuesto ?? 0),
            ) && <TramoLeyenda color={COLOR_EXCEDIDO} etiqueta="Excedido" />}
          </XStack>
        </>
      )}

      <DesgloseRaciones
        abierto={!!abierta}
        titulo={
          abierta
            ? `Semana ${numeroDeSemana(abierta.Inicio).replace('S', '')} · ${fechaCorta(abierta.Inicio)} al ${fechaCorta(abierta.Fin)}`
            : ''
        }
        subtitulo={
          abierta
            ? `${abierta.Raciones} ${abierta.Raciones === 1 ? 'ración' : 'raciones'} de ${fmtDinero(abierta.Presupuesto)} · ${abierta.Empleados} empleado(s)`
            : ''
        }
        destacado={mayorDeLaSemana}
        destacadoRotulo="MÁS RACIONES DE LA SEMANA"
        raciones={raciones}
        cargando={cargandoRaciones}
        error={errorRaciones}
        vacio="Esa semana no se otorgó alimentación en sus áreas."
        onCerrar={cerrarSemana}
      />
    </YStack>
  )
}

// ── Diálogo: las raciones otorgadas ─────────────────────────────────────────
//
// UNA FILA POR RACIÓN y no por empleado: alguien que recibió alimentación tres
// días distintos son tres raciones, y acá hay que poder ver cuáles. Agrupando
// por empleado se perdía justamente eso.
//
// El horario va en el renglón porque es lo que EXPLICA la ración: se otorga a
// partir de cierta hora, así que sin él el renglón dice quién pero no por qué.
function DesgloseRaciones({
  abierto,
  titulo,
  subtitulo,
  destacado,
  destacadoRotulo,
  raciones,
  cargando,
  error,
  vacio,
  onCerrar,
}: {
  abierto: boolean
  titulo: string
  subtitulo: string
  /** Un dato que merece su propio renglón, como el área con más raciones. */
  destacado?: string
  destacadoRotulo?: string
  raciones: IOvertimeMealEmployee[]
  cargando: boolean
  error: string
  /** Qué decir cuando la consulta salió bien y no hay nada. */
  vacio?: string
  onCerrar: () => void
}) {
  const total = raciones.reduce((acc, r) => acc + Number(r.Costo ?? 0), 0)

  /** 'HH:mm' de una fecha con hora. Vacío si no vino. */
  const hora = (valor: string | null): string =>
    valor ? String(valor).substring(11, 16) : ''

  return (
    <Modal visible={abierto} transparent animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="flex-end">
        <YStack
          backgroundColor="$backgroundElevated"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          paddingHorizontal="$4"
          paddingTop="$4"
          paddingBottom="$5"
          maxHeight="85%"
          gap="$3"
        >
          <YStack gap={2}>
            <Text fontSize={15} fontWeight="800" color="$text" numberOfLines={2}>
              {titulo}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {subtitulo}
            </Text>
          </YStack>

          {/* El dato destacado en su propio renglón. Salió del eje del gráfico
              —ahí el nombre había que recortarlo tanto que no servía— y acá va
              completo. */}
          {!!destacado && (
            <XStack
              alignItems="center"
              gap="$2"
              paddingHorizontal="$2.5"
              paddingVertical="$2"
              borderRadius="$3"
              backgroundColor={`${COLOR_GASTADO}18`}
              borderWidth={1}
              borderColor={`${COLOR_GASTADO}55`}
            >
              <TrendingUp size={14} color={COLOR_GASTADO} />
              <YStack flex={1} minWidth={0}>
                {!!destacadoRotulo && (
                  <Text fontSize={8} fontWeight="800" color={COLOR_GASTADO} letterSpacing={0.5}>
                    {destacadoRotulo}
                  </Text>
                )}
                <Text fontSize={11} color="$text" numberOfLines={2}>
                  {destacado}
                </Text>
              </YStack>
            </XStack>
          )}

          <XStack
            justifyContent="space-between"
            backgroundColor="$backgroundSurface"
            borderRadius="$4"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <YStack>
              <Text fontSize={9} color="$textMuted">
                Raciones
              </Text>
              <Text fontSize={14} fontWeight="800" color="$text">
                {raciones.length}
              </Text>
            </YStack>
            <YStack alignItems="flex-end">
              <Text fontSize={9} color="$textMuted">
                Otorgado
              </Text>
              <Text fontSize={14} fontWeight="800" color={COLOR_GASTADO}>
                {fmtDinero(total)}
              </Text>
            </YStack>
          </XStack>

          {cargando ? (
            <YStack gap="$3" paddingVertical="$2">
              {[0, 1, 2].map(i => (
                <XStack key={i} alignItems="center" gap="$2">
                  <YStack flex={1} gap={4}>
                    <SkeletonBox width="70%" height={12} />
                    <SkeletonBox width="45%" height={9} />
                  </YStack>
                  <SkeletonBox width={50} height={12} />
                </XStack>
              ))}
            </YStack>
          ) : error ? (
            <Text fontSize={12} color={COLOR_EXCEDIDO} lineHeight={17}>
              {error}
            </Text>
          ) : raciones.length === 0 ? (
            <Text fontSize={12} color="$textMuted" lineHeight={17}>
              {vacio ?? 'No se otorgó alimentación en el período.'}{' '}
              Solo cuentan las revisiones ya aprobadas con la casilla marcada.
            </Text>
          ) : (
            <FlatList
              data={raciones}
              keyExtractor={(r, i) => `${r.Employee_Code}-${r.Fecha}-${i}`}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => (
                <View height={1} backgroundColor="$border" opacity={0.5} />
              )}
              renderItem={({ item }) => (
                <XStack paddingVertical="$2.5" gap="$2" alignItems="center">
                  <YStack flex={1} minWidth={0}>
                    <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={1}>
                      {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
                    </Text>
                    <Text fontSize={9} color="$textMuted" numberOfLines={1}>
                      {[
                        `${diaCorto(item.Fecha)} ${fechaCorta(item.Fecha)}`,
                        hora(item.Inicio) && hora(item.Fin)
                          ? `${hora(item.Inicio)} a ${hora(item.Fin)}`
                          : '',
                        item.Centro_Costos,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </YStack>

                  <Text fontSize={12} fontWeight="800" color="$text">
                    {fmtDinero(item.Costo)}
                  </Text>
                </XStack>
              )}
            />
          )}

          <Button backgroundColor="$backgroundSurface" onPress={onCerrar}>
            <Text fontWeight="700" color="$text">
              Cerrar
            </Text>
          </Button>
        </YStack>
      </View>
    </Modal>
  )
}

// ── 2. El mismo presupuesto, repartido por área ─────────────────────────────
//
// COLUMNAS APILADAS: la columna completa es lo asignado al área y el tramo
// naranja lo que va gastado, con los mismos colores de la dona de arriba. Se
// lee de un vistazo cuánto tiene y cuánto lleva, que es la misma pregunta pero
// área por área.
//
// El exceso va como un tercer tramo rojo que sobresale del presupuesto. Un
// apilado no admite un tramo negativo, y si el disponible entrara en cero sin
// más, un área pasada se vería igual que una que gastó justo lo asignado.
//
// SOLO LAS ÁREAS CON MOVIMIENTO. Una columna que es puro verde no dice nada que
// el total de arriba no diga ya, y con veinte de esas las que sí gastaron
// quedan perdidas. Cuántas quedaron fuera se dice en el encabezado: un
// departamento que no aparece hace dudar de la consulta, no del gasto.
//
// El corte se elige DENTRO de la tarjeta y no arriba: manda solo sobre este
// gráfico, y puesto en el encabezado de la pantalla parecería cambiar también
// el total de la dona.
function TarjetaAreas({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [nivel, setNivel] = useState<NivelCorte>(NIVEL_INICIAL)
  const [filas, setFilas] = useState<IOvertimeBudgetRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  // Área abierta en el desglose. null = diálogo cerrado.
  const [areaAbierta, setAreaAbierta] = useState<IOvertimeBudgetRow | null>(null)
  const [empleados, setEmpleados] = useState<IOvertimeBudgetEmployee[]>([])
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  const [errorEmpleados, setErrorEmpleados] = useState<string>('')

  const corte = CORTES.find(c => c.nivel === nivel) ?? CORTES[0]

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getBudgetAreas(companyCode, nivel, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir el presupuesto por área.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar el presupuesto por área.')
        return
      }

      setFilas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, nivel, inicio, fin])

  // Cambiar de corte es una consulta nueva: la pantalla dibuja UNO a la vez y
  // traer los tres sería pagar tres ejecuciones para mostrar una.
  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  /**
   * Las áreas que se dibujan, de más a menos gasto.
   *
   * Horas O costo, no solo costo: un área con horas aprobadas y sin valor hora
   * configurado cuesta cero, y esa SÍ tiene que verse —es un dato que hay que
   * ir a corregir, no un área sin movimiento—.
   */
  const conGasto = useMemo(
    () =>
      filas
        .filter(f => Number(f.Costo ?? 0) > 0 || Number(f.Horas ?? 0) > 0)
        .sort((a, b) => Number(b.Costo ?? 0) - Number(a.Costo ?? 0)),
    [filas],
  )

  const sinGasto = filas.length - conGasto.length

  /**
   * Lo gastado contra lo asignado EN ESTE CORTE.
   *
   * Sale de sumar las filas del corte y no de los totales de la dona. Son dos
   * preguntas distintas: la dona mira el presupuesto desde el centro de costos
   * —la hoja del árbol, donde cada lempira aparece una sola vez— y esto es la
   * suma de lo que se está dibujando. Con un usuario que tiene solo parte de
   * una unidad los dos números pueden no coincidir, y el que corresponde acá es
   * el de las columnas que se ven.
   *
   * Se suman TODAS las filas, incluidas las que no gastaron: el gráfico las
   * esconde porque no aportan columna, pero su presupuesto sigue asignado y
   * sacarlo del denominador mostraría un consumo más alto del real.
   */
  const resumen = useMemo(() => {
    if (filas.length === 0) return null

    const gastado = filas.reduce((acc, f) => acc + Number(f.Costo ?? 0), 0)
    const presupuesto = filas.reduce((acc, f) => acc + Number(f.Presupuesto ?? 0), 0)

    return {
      gastado,
      presupuesto,
      // Sin presupuesto no hay porcentaje que calcular: dividir por cero daría
      // 'Infinity%'.
      porcentaje: presupuesto > 0 ? (gastado * 100) / presupuesto : 0,
      excedido: presupuesto > 0 && gastado > presupuesto,
    }
  }, [filas])

  // El ancho útil de la tarjeta: la pantalla menos su padding (12+12) y el de
  // la tarjeta (12+12).
  const anchoTarjeta = width - 48

  const medidas = useMemo(
    () => medidasColumnas(conGasto.length, anchoTarjeta),
    [conGasto.length, anchoTarjeta],
  )

  /**
   * Abre el desglose de un área.
   *
   * Se pide al abrir y no junto con el gráfico: serían tantas consultas como
   * áreas, y en la mayoría de las aperturas solo interesa una.
   */
  const abrirArea = useCallback(
    async (fila: IOvertimeBudgetRow) => {
      if (!companyCode || !fila.Codigo) return

      setAreaAbierta(fila)
      setEmpleados([])
      setErrorEmpleados('')
      setCargandoEmpleados(true)

      try {
        const res = await overtimeService.getBudgetEmployees(
          companyCode,
          fila.Codigo,
          nivel,
          inicio,
          fin,
        )

        if (!res) {
          setErrorEmpleados('El servidor respondió vacío al pedir el desglose del área.')
          return
        }

        if (!res.Success) {
          setErrorEmpleados(res.ErrorMessage || 'No se pudo cargar el desglose.')
          return
        }

        setEmpleados(res.Data ?? [])
      } catch (err: any) {
        // Al mensaje clasificado se le pega el crudo: sin él, un fallo que no
        // sea HTTP ni de red queda como 'ocurrió un error inesperado' y no hay
        // por dónde empezar a buscar.
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorEmpleados(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message} (${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoEmpleados(false)
      }
    },
    [companyCode, nivel, inicio, fin],
  )

  const cerrarArea = useCallback(() => {
    setAreaAbierta(null)
    setEmpleados([])
    setErrorEmpleados('')
  }, [])

  const columnas = useMemo(
    () =>
      conGasto.map(f => {
        const gastado = Number(f.Costo ?? 0)
        const disponible = Number(f.Disponible ?? 0)

        return {
          label: etiquetaArea(f),

          // El toque va en la COLUMNA y no en el gráfico. La librería mira
          // primero el `onPress` del item y solo cae al del gráfico si no lo
          // hay, así que este es el camino directo: no depende de que el índice
          // que reporta el gráfico corresponda a la fila correcta.
          onPress: () => abrirArea(f),

          stacks: tramosApilados([
            // Sin un mínimo, un área de monto chico no dibuja nada y parece no
            // tener gasto.
            { value: Math.max(gastado, gastado > 0 ? 1 : 0), color: COLOR_GASTADO },
            { value: Math.max(0, disponible), color: COLOR_DISPONIBLE },
            { value: Math.max(0, -disponible), color: COLOR_EXCEDIDO },
          ]),
        }
      }),
    [conGasto, abrirArea],
  )

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            {corte.titulo}
          </Text>

          {/* Que las columnas se pueden tocar no se ve por ningún lado, y sin
              decirlo el desglose queda escondido detrás de algo que nadie va a
              probar. */}
          {!cargando && conGasto.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Toque una columna para ver sus empleados
            </Text>
          )}
        </YStack>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      {/* Las pastillas quedan habilitadas mientras carga: cambiar de corte es
          justamente lo que dispara la consulta que falta. */}
      <SelectorCorte activo={nivel} cargando={cargando} onCambiar={setNivel} />

      {cargando ? (
        <EsqueletoColumnas />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : conGasto.length === 0 ? (
        /* Se distingue 'ninguna área gastó' de 'no tiene áreas': con el mismo
           texto para los dos casos, quien tiene áreas configuradas creería que
           se le perdieron. */
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <BarChart3 size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            No hay horas extra aprobadas en tus áreas para esta semana.
          </Text>
          {sinGasto > 0 && (
            <Text fontSize={10} color="$textMuted" textAlign="center">
              {sinGasto} {sinGasto === 1 ? 'área' : 'áreas'} sin movimiento.
            </Text>
          )}
        </YStack>
      ) : (
        <>
          {/* PRIMERO se adelgazan las columnas para que quepan; recién
              cuando ya no se puede, scroll de lado. Ver `medidasColumnas`.

              El scroll es EL DE LA LIBRERÍA, no un ScrollView alrededor: la
              librería ya monta el suyo por dentro, y anidar dos scrolls
              horizontales se traga el toque de las columnas —el gesto lo
              atrapaba el contenedor de afuera y el desglose no abría nunca—.

              `overflow: hidden` en el contenedor es lo que garantiza que nada
              se salga de la tarjeta: si algún cálculo de ancho quedara corto,
              el gráfico se recorta en el borde en lugar de desbordarla. */}
          <View width={anchoTarjeta} overflow="hidden">
            <BarChart
              stackData={columnas}
              /* Ojo: este es el ancho del ÁREA DE COLUMNAS y no incluye la
                 franja de los rótulos del eje. */
              width={medidas.plot}
              /* Con pocas áreas el contenido no llena la tarjeta y el scroll
                 interno queda inerte, que es lo correcto. */
              disableScroll={!medidas.scroll}
              height={CHART_H}
              barWidth={medidas.barW}
              spacing={medidas.spacing}
              initialSpacing={BAR_INITIAL}
              noOfSections={4}
              yAxisLabelWidth={Y_LABEL_W}
              yAxisTextStyle={{ fontSize: 9, color: muted }}
              /* El rótulo se lleva el ancho de su columna más su espacio: sin
                 esto la librería le da el de la barra sola y un código de cinco
                 caracteres se recorta aunque haya aire al lado. */
              labelWidth={medidas.barW + medidas.spacing}
              rotateLabel={medidas.girar}
              xAxisLabelTextStyle={{ fontSize: 8, color: muted }}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={grid}
              rulesColor={grid}
              rulesType="dashed"
              /* El eje en miles: 'L 53,892' bajo cada marca no entra en el
                 ancho que deja el lienzo, y con cuatro marcas son cuatro
                 números compitiendo con las columnas. */
              formatYLabel={(valor: string) => {
                const n = Number(valor)
                if (!n) return '0'
                return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
              }}
              /* El índice apunta a `conGasto`: las columnas se construyen desde
                 ahí y en el mismo orden. */
              onPress={(_item: any, index: number) => {
                const fila = conGasto[index]
                if (fila) abrirArea(fila)
              }}
            />
          </View>

          {/* Leyenda de los tres tramos. El rojo solo aparece cuando hay un
              área pasada: explicar un color que no está en pantalla es ruido. */}
          <XStack gap="$3" justifyContent="center" flexWrap="wrap">
            <TramoLeyenda color={COLOR_GASTADO} etiqueta="Gastado" />
            <TramoLeyenda color={COLOR_DISPONIBLE} etiqueta="Disponible" />
            {conGasto.some(f => Number(f.Disponible ?? 0) < 0) && (
              <TramoLeyenda color={COLOR_EXCEDIDO} etiqueta="Excedido" />
            )}
          </XStack>
        </>
      )}

      <DesgloseEmpleados
        abierto={!!areaAbierta}
        titulo={areaAbierta?.Nombre || areaAbierta?.Codigo || ''}
        subtitulo={
          areaAbierta
            ? `${corte.titulo} · ${areaAbierta.Codigo} · ${empleados.length} empleado(s)`
            : ''
        }
        empleados={empleados}
        cargando={cargandoEmpleados}
        error={errorEmpleados}
        vacio="Ningún empleado de esta área tiene horas extra aprobadas en el período. Puede haber solicitudes pendientes de firma: acá solo cuentan las que ya pasaron por todas las entidades."
        onCerrar={cerrarArea}
      />
    </YStack>
  )
}

function TramoLeyenda({ color, etiqueta }: { color: string; etiqueta: string }) {
  return (
    <XStack alignItems="center" gap={5}>
      <View width={8} height={8} borderRadius={2} backgroundColor={color} />
      <Text fontSize={9} color="$textMuted">
        {etiqueta}
      </Text>
    </XStack>
  )
}

/** Columnas decrecientes, como el gráfico que viene ordenado por gasto. */
function EsqueletoColumnas() {
  return (
    <XStack height={CHART_H} alignItems="flex-end" justifyContent="space-around" gap="$2">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View
          key={i}
          width={BAR_W_MAX}
          height={`${92 - i * 12}%`}
          borderTopLeftRadius={3}
          borderTopRightRadius={3}
          backgroundColor="$textDisabled"
          opacity={0.3}
        />
      ))}
    </XStack>
  )
}

// ── 3. El gasto, día por día ────────────────────────────────────────────────
//
// La dona dice CUÁNTO se gastó en la semana; esto dice CUÁNDO. Es la misma
// plata mirada por fecha en lugar de por área.
//
// LAS BARRAS SE MIDEN CONTRA EL DÍA MÁS CARO y no contra el presupuesto: acá se
// viene a ver el reparto de la semana, y contra el presupuesto semanal las
// siete quedarían igual de chatas y no se distinguiría el día desbocado, que es
// justo lo que se busca.
//
// Solo vienen los días CON movimiento, así que un día sin horas simplemente no
// tiene columna. El rótulo lleva la fecha —'Mar 09/09'— y no solo el nombre del
// día: comparando contra otra semana, 'Mar' no dice el martes de cuál.
function TarjetaDias({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [dias, setDias] = useState<IOvertimeDayTotal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  // Día abierto en el desglose. null = diálogo cerrado.
  const [diaAbierto, setDiaAbierto] = useState<IOvertimeDayTotal | null>(null)
  const [empleados, setEmpleados] = useState<IOvertimeBudgetEmployee[]>([])
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  const [errorEmpleados, setErrorEmpleados] = useState<string>('')

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getBudgetDays(companyCode, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir el gasto por día.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar el gasto por día.')
        return
      }

      setDias(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  const maxCosto = useMemo(
    () => dias.reduce((m, d) => Math.max(m, Number(d.Costo ?? 0)), 0),
    [dias],
  )

  const totalSemana = useMemo(
    () => dias.reduce((acc, d) => acc + Number(d.Costo ?? 0), 0),
    [dias],
  )

  /**
   * Los días llegaron pero ninguno tuvo gasto.
   *
   * Siete columnas en cero no dibujan nada y se ven igual que un gráfico roto,
   * así que en ese caso se dice con palabras. Es distinto de 'sin días', que es
   * no tener período.
   */
  const sinGasto = dias.length > 0 && maxCosto === 0

  /**
   * Abre el desglose de un día.
   *
   * Va SIN código de área: la gente de un día viene de varias, y el corte es la
   * fecha. El procedimiento trata el código vacío como 'todas las del alcance'.
   */
  const abrirDia = useCallback(
    async (dia: IOvertimeDayTotal) => {
      const fecha = String(dia?.Fecha ?? '').substring(0, 10)
      if (!companyCode || !fecha) return

      setDiaAbierto(dia)
      setEmpleados([])
      setErrorEmpleados('')
      setCargandoEmpleados(true)

      try {
        // Sin área: la gente de un día viene de varias, y el corte es la
        // fecha. El procedimiento trata la ausencia como 'todas las del
        // alcance'.
        const res = await overtimeService.getBudgetEmployees(
          companyCode,
          undefined,
          'businessUnit',
          fecha,
          fecha,
        )

        if (!res) {
          setErrorEmpleados('El servidor respondió vacío al pedir el detalle del día.')
          return
        }

        if (!res.Success) {
          setErrorEmpleados(res.ErrorMessage || 'No se pudo cargar el detalle del día.')
          return
        }

        setEmpleados(res.Data ?? [])
      } catch (err: any) {
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorEmpleados(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message} (${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoEmpleados(false)
      }
    },
    [companyCode],
  )

  const cerrarDia = useCallback(() => {
    setDiaAbierto(null)
    setEmpleados([])
    setErrorEmpleados('')
  }, [])

  const anchoTarjeta = width - 48

  const medidas = useMemo(
    () => medidasColumnas(dias.length, anchoTarjeta),
    [dias.length, anchoTarjeta],
  )

  const barras = useMemo(
    () =>
      dias.map(d => ({
        value: Number(d.Costo ?? 0),
        label: `${diaCorto(d.Fecha)}\n${fechaCorta(d.Fecha)}`,
        // El día más caro en naranja fuerte y el resto apagado: es el que
        // motiva la pregunta, y con las siete iguales hay que ir a buscarlo
        // comparando alturas.
        frontColor:
          maxCosto > 0 && Number(d.Costo ?? 0) === maxCosto ? COLOR_GASTADO : COLOR_GASTADO_SUAVE,
        onPress: () => abrirDia(d),
      })),
    [dias, maxCosto, abrirDia],
  )

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  /**
   * El centro de costos que más gastó en el día abierto.
   *
   * Va en el diálogo y NO en el eje: el nombre de un centro de costos debajo de
   * una columna había que recortarlo tanto que no servía para reconocerlo.
   */
  const mayorDelDia = diaAbierto?.Top_Centro
    ? `${diaAbierto.Top_Centro} — ${fmtDinero(diaAbierto.Top_Centro_Costo)}`
    : ''

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            Gasto por día
          </Text>
          {!cargando && !sinGasto && dias.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Toque un día para ver sus empleados
            </Text>
          )}
        </YStack>

        <XStack alignItems="center" gap="$1.5" flexShrink={0}>
          {/* El total de la semana sale de ESTOS días y no de la dona: es la
              suma de lo que se está dibujando, y así el número y las columnas
              no pueden discrepar. */}
          {!cargando && !error && dias.length > 0 && (
            <Text fontSize={12} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
              {fmtDinero(totalSemana)}
            </Text>
          )}

          <View
            padding="$1.5"
            borderRadius={999}
            opacity={cargando ? 0.35 : 1}
            pressStyle={cargando ? undefined : { opacity: 0.5 }}
            onPress={cargando ? undefined : cargar}
          >
            <RefreshCw size={14} color="#94A3B8" />
          </View>
        </XStack>
      </XStack>

      {cargando ? (
        <EsqueletoDias />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : dias.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            No hubo horas extra aprobadas ningún día de esta semana.
          </Text>
          <Text fontSize={10} color="$textMuted" textAlign="center" lineHeight={14}>
            Puede haber solicitudes pendientes de firma: acá solo cuentan las que ya pasaron
            por todas las entidades.
          </Text>
        </YStack>
      ) : sinGasto ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Los días de la semana no tienen gasto aprobado.
          </Text>
        </YStack>
      ) : (
        <View width={anchoTarjeta} overflow="hidden">
          <BarChart
            data={barras}
            width={medidas.plot}
            disableScroll={!medidas.scroll}
            height={CHART_H}
            barWidth={medidas.barW}
            spacing={medidas.spacing}
            initialSpacing={BAR_INITIAL}
            noOfSections={4}
            barBorderTopLeftRadius={3}
            barBorderTopRightRadius={3}
            /* Un día de gasto muy chico no se dibujaría y se leería como un día
               sin horas extra, que no es lo mismo. */
            minHeight={2}
            yAxisLabelWidth={Y_LABEL_W}
            yAxisTextStyle={{ fontSize: 9, color: muted }}
            labelWidth={medidas.barW + medidas.spacing}
            xAxisLabelTextStyle={{ fontSize: 8, color: muted, textAlign: 'center' }}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={grid}
            rulesColor={grid}
            rulesType="dashed"
            formatYLabel={(valor: string) => {
              const n = Number(valor)
              if (!n) return '0'
              return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
            }}
            onPress={(_item: any, index: number) => {
              const dia = dias[index]
              if (dia) abrirDia(dia)
            }}
          />
        </View>
      )}

      <DesgloseEmpleados
        abierto={!!diaAbierto}
        titulo={diaAbierto ? `${diaCorto(diaAbierto.Fecha)} ${fechaCorta(diaAbierto.Fecha)}` : ''}
        subtitulo={
          diaAbierto
            ? `${fmtDinero(diaAbierto.Costo)} · ${fmtHoras(diaAbierto.Horas)} · ${empleados.length} empleado(s)`
            : ''
        }
        destacado={mayorDelDia}
        destacadoRotulo="MAYOR GASTO DEL DÍA"
        empleados={empleados}
        cargando={cargandoEmpleados}
        error={errorEmpleados}
        vacio="Ese día no tiene empleados con horas extra aprobadas."
        onCerrar={cerrarDia}
      />
    </YStack>
  )
}

/** Siete columnas de alto desigual, como los días de una semana. */
function EsqueletoDias() {
  return (
    <XStack height={CHART_H} alignItems="flex-end" justifyContent="space-around" gap="$2">
      {[55, 80, 40, 95, 65, 30, 45].map((h, i) => (
        <View
          key={i}
          width={BAR_W_MAX}
          height={`${h}%`}
          borderTopLeftRadius={3}
          borderTopRightRadius={3}
          backgroundColor="$textDisabled"
          opacity={0.3}
        />
      ))}
    </XStack>
  )
}

// ── 4. La semana contra las anteriores ──────────────────────────────────────
//
// El total de una semana no dice si es mucho: lo dice al lado de las que la
// precedieron. Por eso la última columna es SIEMPRE la semana en curso y no la
// que está en el filtro de arriba —la comparación es contra el presente, y una
// serie que termina en una semana de hace dos meses no contesta 'vamos bien o
// vamos mal'—.
//
// DOS COLUMNAS POR SEMANA, no apiladas: lo gastado en naranja y lo que queda en
// verde, al lado. Apiladas, el total de la columna sería gasto MÁS disponible
// —o sea el presupuesto— y una semana gastada mediría lo mismo que una intacta.
//
// Las semanas las manda esta pantalla y no las calcula la base: el calendario
// de planilla ya está cargado acá para el filtro, y la semana de horas extra la
// define ese calendario, no una división por siete días.
function TarjetaSemanas({
  companyCode,
  calendario,
  refrescoId,
}: {
  companyCode: string
  calendario: IPayWebWeek[]
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [cuantas, setCuantas] = useState(SEMANAS_INICIAL)
  const [semanas, setSemanas] = useState<IOvertimeWeekTotal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  // Semana abierta en el desglose. null = diálogo cerrado.
  const [abierta, setAbierta] = useState<IOvertimeWeekTotal | null>(null)
  const [empleados, setEmpleados] = useState<IOvertimeBudgetEmployee[]>([])
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  const [errorEmpleados, setErrorEmpleados] = useState<string>('')

  const rangos = useMemo(() => semanasHastaLaActual(calendario, cuantas), [calendario, cuantas])

  const cargar = useCallback(async () => {
    if (!companyCode) return

    if (rangos.length === 0) {
      setSemanas([])
      setCargando(false)
      return
    }

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getBudgetWeeks(companyCode, rangos)

      if (!res) {
        setError('El servidor respondió vacío al pedir el comparativo.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar el comparativo.')
        return
      }

      setSemanas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, rangos])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  /** El número de semana del calendario, para rotular. */
  const numeroDeSemana = useCallback(
    (inicio: string): string => {
      const key = String(inicio ?? '').substring(0, 10)
      const w = calendario.find(x => String(x.InitialDate ?? '').substring(0, 10) === key)

      return w ? `S${w.WeekNumber}` : fechaCorta(key)
    },
    [calendario],
  )

  const esActual = useCallback(
    (inicio: string): boolean => {
      const key = String(inicio ?? '').substring(0, 10)

      return calendario.some(
        w => w.IsCurrentWeek === true && String(w.InitialDate ?? '').substring(0, 10) === key,
      )
    },
    [calendario],
  )

  const anchoTarjeta = width - 48

  /**
   * Cada semana ocupa DOS columnas, así que para el cálculo de ancho cuenta
   * doble. Sin esto las barras salían del doble de anchas de lo que cabía.
   */
  const medidas = useMemo(
    () => medidasColumnas(semanas.length * 2, anchoTarjeta),
    [semanas.length, anchoTarjeta],
  )

  /**
   * Abre el desglose de una semana.
   *
   * Sin código de área, igual que el de un día: la gente de una semana viene
   * de varias áreas y el corte es el rango.
   */
  const abrirSemana = useCallback(
    async (semana: IOvertimeWeekTotal) => {
      const inicio = String(semana?.Inicio ?? '').substring(0, 10)
      const fin = String(semana?.Fin ?? '').substring(0, 10)
      if (!companyCode || !inicio || !fin) return

      setAbierta(semana)
      setEmpleados([])
      setErrorEmpleados('')
      setCargandoEmpleados(true)

      try {
        const res = await overtimeService.getBudgetEmployees(
          companyCode,
          undefined,
          'businessUnit',
          inicio,
          fin,
        )

        if (!res) {
          setErrorEmpleados('El servidor respondió vacío al pedir el detalle de la semana.')
          return
        }

        if (!res.Success) {
          setErrorEmpleados(res.ErrorMessage || 'No se pudo cargar el detalle de la semana.')
          return
        }

        setEmpleados(res.Data ?? [])
      } catch (err: any) {
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorEmpleados(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message} (${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoEmpleados(false)
      }
    },
    [companyCode],
  )

  const cerrarSemana = useCallback(() => {
    setAbierta(null)
    setEmpleados([])
    setErrorEmpleados('')
  }, [])

  /**
   * Las barras: dos por semana, agrupadas.
   *
   * `spacing` es el aire DENTRO del par y el que separa un par del siguiente lo
   * pone la propia librería con `spacing` en la segunda barra: por eso la
   * primera va pegada a la segunda y la segunda deja el hueco.
   */
  const barras = useMemo(() => {
    const salida: any[] = []

    semanas.forEach(s => {
      const gastado = Number(s.Costo ?? 0)
      const presupuesto = Number(s.Presupuesto ?? 0)
      const excedido = presupuesto > 0 && gastado > presupuesto
      const actual = esActual(s.Inicio)

      salida.push({
        value: gastado,
        // Rojo la semana que se pasó, naranja fuerte la actual y naranja
        // apagado las anteriores. El exceso gana sobre el resaltado de la
        // actual: es la alarma, y si una semana vieja se pasó hay que verlo
        // igual.
        frontColor: excedido ? COLOR_EXCEDIDO : actual ? COLOR_GASTADO : COLOR_GASTADO_SUAVE,
        // El rótulo va en la PRIMERA barra del par y centrado sobre las dos.
        label: numeroDeSemana(s.Inicio),
        spacing: 2,
        onPress: () => abrirSemana(s),
      })

      salida.push({
        // Lo que QUEDA, no el presupuesto entero: así las dos barras suman el
        // presupuesto de la semana y el ojo compara proporciones sin restar.
        // En cero cuando se pasó: una barra negativa se dibuja al revés.
        value: Math.max(0, presupuesto - gastado),
        frontColor: COLOR_DISPONIBLE,
        onPress: () => abrirSemana(s),
      })
    })

    return salida
  }, [semanas, esActual, numeroDeSemana, abrirSemana])

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  const mayorDeLaSemana = abierta?.Top_Centro
    ? `${abierta.Top_Centro} — ${fmtDinero(abierta.Top_Centro_Costo)}`
    : ''

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            Comparativo de las últimas semanas
          </Text>
          <Text fontSize={9} color="$textMuted">
            {/* Que no responde al filtro de arriba hay que decirlo: si no,
                mover la semana y ver que este gráfico no cambia parece que
                está roto. */}
            Siempre termina en la semana actual
          </Text>
        </YStack>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      <SelectorCuantasSemanas valor={cuantas} onCambiar={setCuantas} />

      {cargando ? (
        <EsqueletoSemanas />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : semanas.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Sin semanas anteriores con las que comparar.
          </Text>
        </YStack>
      ) : (
        <>
          <View width={anchoTarjeta} overflow="hidden">
            <BarChart
              data={barras}
              width={medidas.plot}
              disableScroll={!medidas.scroll}
              height={CHART_H}
              barWidth={medidas.barW}
              /* El aire ENTRE PARES. El de adentro del par lo pone cada barra
                 con su propio `spacing`. */
              spacing={medidas.spacing + 6}
              initialSpacing={BAR_INITIAL}
              noOfSections={4}
              barBorderTopLeftRadius={3}
              barBorderTopRightRadius={3}
              /* Una semana de gasto muy chico no se dibujaría y se leería como
                 una semana sin horas extra, que no es lo mismo. */
              minHeight={2}
              yAxisLabelWidth={Y_LABEL_W}
              yAxisTextStyle={{ fontSize: 9, color: muted }}
              xAxisLabelTextStyle={{ fontSize: 8, color: muted }}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={grid}
              rulesColor={grid}
              rulesType="dashed"
              formatYLabel={(valor: string) => {
                const n = Number(valor)
                if (!n) return '0'
                return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
              }}
              /* El índice es de las BARRAS, que son dos por semana: dividido
                 dos da la semana que se tocó. */
              onPress={(_item: any, index: number) => {
                const semana = semanas[Math.floor(index / 2)]
                if (semana) abrirSemana(semana)
              }}
            />
          </View>

          <XStack gap="$3" justifyContent="center" flexWrap="wrap">
            <TramoLeyenda color={COLOR_GASTADO} etiqueta="Gastado" />
            <TramoLeyenda color={COLOR_DISPONIBLE} etiqueta="Disponible" />
            {semanas.some(
              s => Number(s.Presupuesto ?? 0) > 0 && Number(s.Costo ?? 0) > Number(s.Presupuesto ?? 0),
            ) && <TramoLeyenda color={COLOR_EXCEDIDO} etiqueta="Excedido" />}
          </XStack>
        </>
      )}

      <DesgloseEmpleados
        abierto={!!abierta}
        titulo={
          abierta
            ? `Semana ${numeroDeSemana(abierta.Inicio).replace('S', '')} · ${fechaCorta(abierta.Inicio)} al ${fechaCorta(abierta.Fin)}`
            : ''
        }
        subtitulo={
          abierta
            ? `${fmtDinero(abierta.Costo)} de ${fmtDinero(abierta.Presupuesto)} · ${fmtHoras(abierta.Horas)} · ${empleados.length} empleado(s)`
            : ''
        }
        destacado={mayorDeLaSemana}
        destacadoRotulo="MAYOR GASTO DE LA SEMANA"
        empleados={empleados}
        cargando={cargandoEmpleados}
        error={errorEmpleados}
        vacio="Esa semana no tiene empleados con horas extra aprobadas."
        onCerrar={cerrarSemana}
      />
    </YStack>
  )
}

/**
 * Cuántas semanas mirar.
 *
 * Con más y menos y no con un campo de texto: en un teléfono abrir el teclado
 * numérico para escribir un '4' es más trabajo que dos toques, y el rango es de
 * dos a seis.
 *
 * Lo comparten los dos comparativos, con su propio contador cada uno: son dos
 * preguntas distintas y no tienen por qué mirar la misma cantidad de semanas.
 */
function SelectorCuantasSemanas({
  valor,
  onCambiar,
}: {
  valor: number
  onCambiar: (n: number) => void
}) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$2">
      <Text fontSize={10} color="$textMuted">
        Semanas a comparar
      </Text>

      <XStack alignItems="center" gap="$1.5">
        <View
          padding={5}
          borderRadius={999}
          borderWidth={1}
          borderColor="$border"
          opacity={valor <= SEMANAS_MIN ? 0.3 : 1}
          pressStyle={valor <= SEMANAS_MIN ? undefined : { opacity: 0.5 }}
          onPress={() => onCambiar(Math.max(SEMANAS_MIN, valor - 1))}
        >
          <Minus size={12} color="#94A3B8" />
        </View>

        <Text fontSize={12} fontWeight="800" color="$text" width={18} textAlign="center">
          {valor}
        </Text>

        <View
          padding={5}
          borderRadius={999}
          borderWidth={1}
          borderColor="$border"
          opacity={valor >= SEMANAS_MAX ? 0.3 : 1}
          pressStyle={valor >= SEMANAS_MAX ? undefined : { opacity: 0.5 }}
          onPress={() => onCambiar(Math.min(SEMANAS_MAX, valor + 1))}
        >
          <Plus size={12} color="#94A3B8" />
        </View>
      </XStack>
    </XStack>
  )
}

/** Pares de columnas, como el comparativo que viene. */
function EsqueletoSemanas() {
  return (
    <XStack height={CHART_H} alignItems="flex-end" justifyContent="space-around" gap="$2">
      {[[70, 30], [50, 50], [85, 15], [40, 60], [60, 40]].map(([a, b], i) => (
        <XStack key={i} gap={2} alignItems="flex-end">
          <View
            width={16}
            height={`${a}%`}
            borderTopLeftRadius={3}
            borderTopRightRadius={3}
            backgroundColor="$textDisabled"
            opacity={0.3}
          />
          <View
            width={16}
            height={`${b}%`}
            borderTopLeftRadius={3}
            borderTopRightRadius={3}
            backgroundColor="$textDisabled"
            opacity={0.2}
          />
        </XStack>
      ))}
    </XStack>
  )
}

// ── Empleados 1. Horas extra por solicitante ────────────────────────────────
//
// PRIMERO, al revés que en el web. En una pantalla que se recorre deslizando,
// el primer bloque es el único que se ve sin moverse, así que se lleva la
// pregunta que se acciona: quién PIDE las horas extra.
//
// El bloque de abajo mira al empleado que las HACE. Son dos preguntas distintas
// y las dos hacen falta: un supervisor puede concentrar la mitad de las horas
// extra de la empresa repartidas entre veinte personas, y en el corte por
// empleado eso no se ve por ningún lado —cada uno de sus veinte aparece con una
// cifra chica—.
//
// MISMA FORMA que el bloque de abajo: barras acostadas en lista. Son dos listas
// de personas ordenadas por horas, y con dos formas distintas habría que
// aprender a leer cada una.
//
// GENERAL, sin corte por área: el solicitante no cuelga de un centro de costos,
// cuelga de las solicitudes que hizo, y esas pueden ser de varias áreas a la
// vez. Partirlo por área lo contaría dos veces.
//
// Y solo lo APROBADO: una solicitud rechazada no dice nada de cuántas horas
// extra genera esa persona en la práctica.
const SOLICITANTES_VISIBLES = 8

function TarjetaSolicitantes({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const [filas, setFilas] = useState<IOvertimeTopRequester[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')
  const [verTodos, setVerTodos] = useState(false)

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getTopRequesters(companyCode, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir los solicitantes.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudieron cargar los solicitantes.')
        return
      }

      setFilas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  useEffect(() => {
    setVerTodos(false)
  }, [inicio, fin])

  // Vienen ordenados de más a menos desde la base, pero se ordena igual: el
  // orden de la lista es lo único que la hace legible y no depende de que la
  // consulta lo mantenga.
  const ordenados = useMemo(
    () => [...filas].sort((a, b) => Number(b.Horas ?? 0) - Number(a.Horas ?? 0)),
    [filas],
  )

  const maxHoras = ordenados.length > 0 ? Number(ordenados[0].Horas ?? 0) : 0
  const totalHoras = ordenados.reduce((acc, r) => acc + Number(r.Horas ?? 0), 0)

  const visibles = verTodos ? ordenados : ordenados.slice(0, SOLICITANTES_VISIBLES)
  const ocultos = ordenados.length - visibles.length

  /**
   * La parte del primero.
   *
   * Es la cifra que dice si el ranking importa: el primero con el 8% de las
   * horas es un ranking sin noticia, con el 45% es el dato de la pantalla.
   */
  const parteMayor = ordenados.length > 0 ? Number(ordenados[0].Parte ?? 0) : 0

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            Horas extra por solicitante
          </Text>
        </YStack>

        <XStack alignItems="center" gap="$1.5" flexShrink={0}>
          {!cargando && !error && ordenados.length > 0 && (
            <YStack alignItems="flex-end">
              <Text fontSize={12} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
                {fmtHoras(totalHoras)}
              </Text>
              <Text fontSize={9} color="$textMuted">
                {ordenados.length} {ordenados.length === 1 ? 'solicitante' : 'solicitantes'}
              </Text>
            </YStack>
          )}

          <View
            padding="$1.5"
            borderRadius={999}
            opacity={cargando ? 0.35 : 1}
            pressStyle={cargando ? undefined : { opacity: 0.5 }}
            onPress={cargando ? undefined : cargar}
          >
            <RefreshCw size={14} color="#94A3B8" />
          </View>
        </XStack>
      </XStack>

      {cargando ? (
        <EsqueletoRenglones filas={SOLICITANTES_VISIBLES} />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : ordenados.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <Users size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Nadie tiene horas extra aprobadas esta semana.
          </Text>
        </YStack>
      ) : (
        <>
          <YStack gap="$2.5">
            {visibles.map((r, i) => (
              <RenglonEmpleado
                key={`${r.Create_By}-${i}`}
                nombre={nombreCorto(r.Solicitante) || r.Create_By}
                // Entre cuánta gente reparte esas horas: es lo que distingue a
                // un supervisor que carga a uno solo de otro que reparte.
                detalle={`${r.Solicitudes} ${r.Solicitudes === 1 ? 'solicitud' : 'solicitudes'} · ${r.Empleados} ${r.Empleados === 1 ? 'empleado' : 'empleados'}`}
                horas={fmtHoras(r.Horas)}
                // Su parte del total en lugar del costo: acá no hay dinero, y
                // el porcentaje es lo que dice si la cifra es mucha o poca.
                costo={fmtPct(r.Parte)}
                parte={maxHoras > 0 ? (Number(r.Horas ?? 0) * 100) / maxHoras : 0}
                // Naranja y no el verde del bloque de abajo: son dos listas
                // parecidas y una al lado de la otra se confundían. El color
                // dice de un vistazo cuál se está leyendo.
                //
                // El color va con el CONTENIDO y no con la posición: el verde
                // es el de las horas por empleado en el web, y sigue siendo el
                // suyo aunque ahora esa lista vaya segunda.
                color={COLOR_GASTADO}
              />
            ))}
          </YStack>

          {ocultos > 0 && (
            <View
              alignSelf="center"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$3"
              backgroundColor={`${ACCENT}18`}
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setVerTodos(true)}
            >
              <Text fontSize={10} fontWeight="800" color={ACCENT}>
                Ver los {ocultos} restantes
              </Text>
            </View>
          )}

          {verTodos && ordenados.length > SOLICITANTES_VISIBLES && (
            <View
              alignSelf="center"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$3"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setVerTodos(false)}
            >
              <Text fontSize={10} fontWeight="700" color="$textMuted">
                Ver solo los primeros {SOLICITANTES_VISIBLES}
              </Text>
            </View>
          )}
        </>
      )}
    </YStack>
  )
}

// ── Empleados 2. Horas extra por empleado ───────────────────────────────────
//
// NO ES UN GRÁFICO, es una LISTA con barra de progreso. El tablero web usa
// columnas de pie con los nombres girados, y eso en un teléfono no funciona:
// debajo de una columna de 34px no entra un nombre, y girado tampoco —queda
// ilegible o hay que ensanchar el lienzo hasta que el gráfico deje de verse
// completo—.
//
// Acostado y como lista, cada persona tiene su renglón: el nombre a la
// izquierda con todo el ancho que necesita, las horas a la derecha, y una barra
// FINA debajo para la proporción. Es el mismo patrón que usa HBarList en el
// tablero de mantenimiento.
//
// LA BARRA SE MIDE CONTRA EL QUE MÁS HIZO, no contra un tope fijo: la pregunta
// es quién se está quedando más, y con una escala absoluta —digamos 12 horas—
// una semana tranquila daría diez barras casi vacías y no se distinguiría nada.
//
// Ordenada de más a menos, que es el orden en que hay que mirarla. Se muestran
// las primeras y el resto se despliega: con sesenta empleados la pestaña
// arrancaba con una lista que no terminaba nunca.
const EMPLEADOS_VISIBLES = 8

function TarjetaEmpleados({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const [empleados, setEmpleados] = useState<IOvertimeBudgetEmployee[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')
  const [verTodos, setVerTodos] = useState(false)

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      // Sin área: son TODOS los empleados del alcance del usuario en la
      // semana. Es el mismo procedimiento del desglose de un área, con el
      // código vacío, así que no hizo falta uno nuevo.
      const res = await overtimeService.getBudgetEmployees(
        companyCode,
        undefined,
        'businessUnit',
        inicio,
        fin,
      )

      if (!res) {
        setError('El servidor respondió vacío al pedir los empleados.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudieron cargar los empleados.')
        return
      }

      setEmpleados(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  // Al cambiar de semana la lista se colapsa: quedaba desplegada mostrando
  // sesenta renglones de una semana que ya no se está mirando.
  useEffect(() => {
    setVerTodos(false)
  }, [inicio, fin])

  /**
   * Los que SÍ tienen horas, de más a menos.
   *
   * El procedimiento devuelve también a quien tiene costo sin horas —un caso
   * raro de datos por corregir— y en una lista de 'quién hizo más horas' un
   * renglón en cero no dice nada.
   */
  const conHoras = useMemo(
    () =>
      empleados
        .filter(e => Number(e.Horas ?? 0) > 0)
        .sort((a, b) => Number(b.Horas ?? 0) - Number(a.Horas ?? 0)),
    [empleados],
  )

  const maxHoras = conHoras.length > 0 ? Number(conHoras[0].Horas ?? 0) : 0

  const totales = useMemo(
    () =>
      conHoras.reduce(
        (acc, e) => ({
          horas: acc.horas + Number(e.Horas ?? 0),
          costo: acc.costo + Number(e.Costo ?? 0),
        }),
        { horas: 0, costo: 0 },
      ),
    [conHoras],
  )

  const visibles = verTodos ? conHoras : conHoras.slice(0, EMPLEADOS_VISIBLES)
  const ocultos = conHoras.length - visibles.length

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
            Horas extra por empleado
          </Text>
        </YStack>

        <XStack alignItems="center" gap="$1.5" flexShrink={0}>
          {!cargando && !error && conHoras.length > 0 && (
            <YStack alignItems="flex-end">
              <Text fontSize={12} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
                {fmtHoras(totales.horas)}
              </Text>
              <Text fontSize={9} color="$textMuted">
                {conHoras.length} {conHoras.length === 1 ? 'empleado' : 'empleados'}
              </Text>
            </YStack>
          )}

          <View
            padding="$1.5"
            borderRadius={999}
            opacity={cargando ? 0.35 : 1}
            pressStyle={cargando ? undefined : { opacity: 0.5 }}
            onPress={cargando ? undefined : cargar}
          >
            <RefreshCw size={14} color="#94A3B8" />
          </View>
        </XStack>
      </XStack>

      {cargando ? (
        <EsqueletoRenglones filas={EMPLEADOS_VISIBLES} />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : conHoras.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <Users size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Nadie hizo horas extra en sus áreas esta semana.
          </Text>
          <Text fontSize={10} color="$textMuted" textAlign="center" lineHeight={14}>
            Solo cuentan las solicitudes que ya pasaron por todas las entidades.
          </Text>
        </YStack>
      ) : (
        <>
          <YStack gap="$2.5">
            {visibles.map((e, i) => (
              <RenglonEmpleado
                key={`${e.Employee_Code}-${i}`}
                nombre={nombreCorto(e.Employee_Name)}
                detalle={[e.Posicion, e.Centro_Costos].filter(Boolean).join(' · ')}
                horas={fmtHoras(e.Horas)}
                costo={fmtDinero(e.Costo)}
                parte={maxHoras > 0 ? (Number(e.Horas ?? 0) * 100) / maxHoras : 0}
              />
            ))}
          </YStack>

          {/* Los que quedan. Con sesenta empleados la pestaña arrancaba con una
              lista que no terminaba nunca, y el que interesa está arriba. */}
          {ocultos > 0 && (
            <View
              alignSelf="center"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$3"
              backgroundColor={`${ACCENT}18`}
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setVerTodos(true)}
            >
              <Text fontSize={10} fontWeight="800" color={ACCENT}>
                Ver los {ocultos} restantes
              </Text>
            </View>
          )}

          {verTodos && conHoras.length > EMPLEADOS_VISIBLES && (
            <View
              alignSelf="center"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$3"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setVerTodos(false)}
            >
              <Text fontSize={10} fontWeight="700" color="$textMuted">
                Ver solo los primeros {EMPLEADOS_VISIBLES}
              </Text>
            </View>
          )}

          <Text fontSize={9} color="$textMuted" textAlign="center" lineHeight={13}>
            {fmtDinero(totales.costo)} en total · solo lo aprobado por todas las entidades
          </Text>
        </>
      )}
    </YStack>
  )
}

// ── Empleados 3. El que más horas hizo en cada área ─────────────────────────
//
// TARJETAS y no barras, igual que en el web. Cada renglón tiene que decir tres
// cosas —el área, la persona y qué parte del área es— y en una barra habría que
// meter el nombre adentro, con el tamaño y el color que dejara el tramo:
// quedaba cargado y ninguno de los tres se leía bien.
//
// En la tarjeta cada dato tiene su lugar: el área de título, la persona con sus
// iniciales, las horas en grande y una barra fina abajo para la proporción.
//
// UNA POR RENGLÓN y no dos por fila: a media pantalla de teléfono el nombre y
// las horas no entran en el mismo renglón sin recortar el nombre, que es
// justamente el dato.
//
// SOLO LAS ÁREAS CON HORAS: donde nadie se quedó no hay a quién señalar. Es
// distinto del tablero de presupuesto, donde un área sin gasto sí es
// información porque tiene presupuesto asignado.
const AREAS_VISIBLES = 6

function TarjetaTopPorArea({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const [nivel, setNivel] = useState<NivelCorte>(NIVEL_INICIAL)
  const [filas, setFilas] = useState<IOvertimeTopEmployee[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')
  const [verTodas, setVerTodas] = useState(false)

  const corte = CORTES.find(c => c.nivel === nivel) ?? CORTES[0]

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getTopEmployeeByArea(companyCode, nivel, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir el mayor de cada área.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar el detalle por área.')
        return
      }

      setFilas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, nivel, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  useEffect(() => {
    setVerTodas(false)
  }, [inicio, fin, nivel])

  const visibles = verTodas ? filas : filas.slice(0, AREAS_VISIBLES)
  const ocultas = filas.length - visibles.length

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={2}>
            {corte.tituloTop}
          </Text>
          {!cargando && filas.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              De más a menos horas · la barra es su parte del área
            </Text>
          )}
        </YStack>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      <SelectorCorte activo={nivel} cargando={cargando} onCambiar={setNivel} />

      {cargando ? (
        <EsqueletoTarjetasArea />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : filas.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <Users size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Ninguna área tuvo horas extra esta semana.
          </Text>
        </YStack>
      ) : (
        <>
          <YStack gap="$2">
            {visibles.map((t, i) => (
              <TarjetaArea key={`${t.Codigo}-${i}`} fila={t} />
            ))}
          </YStack>

          {ocultas > 0 && (
            <View
              alignSelf="center"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$3"
              backgroundColor={`${ACCENT}18`}
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setVerTodas(true)}
            >
              <Text fontSize={10} fontWeight="800" color={ACCENT}>
                Ver las {ocultas} restantes
              </Text>
            </View>
          )}

          {verTodas && filas.length > AREAS_VISIBLES && (
            <View
              alignSelf="center"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$3"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setVerTodas(false)}
            >
              <Text fontSize={10} fontWeight="700" color="$textMuted">
                Ver solo las primeras {AREAS_VISIBLES}
              </Text>
            </View>
          )}
        </>
      )}
    </YStack>
  )
}

// ── Empleados 4. El que más horas hizo cada día ─────────────────────────────
//
// La misma pregunta que el bloque de arriba con otro agrupador: la fecha en
// lugar del área. Contesta algo que el corte por área no puede —un pico del
// martes se explica mirando quién lo puso, y esa persona puede estar repartida
// en varias áreas—.
//
// BARRAS APILADAS, y acá sí va el naranja pálido: el tramo fuerte son las horas
// del que encabeza y el pálido lo que hizo el resto de la gente, así que la
// columna entera mide el día y la proporción se ve sin leer un porcentaje.
//
// Con una sola barra —solo las horas del que encabeza— un martes de 4h se veía
// igual de alto que un martes de 4h sobre 40h, y son dos cosas distintas.
//
// Es el único gráfico de esta pantalla donde apilar tiene sentido, porque los
// dos tramos SUMAN el total real del día. En el comparativo de semanas no:
// gastado más disponible da el presupuesto, y todas las columnas medirían lo
// mismo.
//
// LOS DÍAS SIN HORAS SE DIBUJAN IGUAL, en cero y con 'Sin horas' donde iría el
// nombre: un hueco en la semana es información, y sin ellos el gráfico
// cambiaría de forma según qué días tuvieron movimiento.
function TarjetaTopPorDia({
  companyCode,
  inicio,
  fin,
  refrescoId,
}: {
  companyCode: string
  inicio?: string
  fin?: string
  refrescoId: number
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const [dias, setDias] = useState<IOvertimeTopEmployeeDay[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string>('')

  const cargar = useCallback(async () => {
    if (!companyCode) return

    setCargando(true)
    setError('')

    try {
      const res = await overtimeService.getTopEmployeeByDay(companyCode, inicio, fin)

      if (!res) {
        setError('El servidor respondió vacío al pedir el mayor de cada día.')
        return
      }

      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudo cargar el detalle por día.')
        return
      }

      setDias(res.Data ?? [])
    } catch (err) {
      setError(handleError(err).message)
    } finally {
      setCargando(false)
    }
  }, [companyCode, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar, refrescoId])

  /** Hay días pero ninguno con horas: es otra respuesta, no un período vacío. */
  const sinHoras = dias.length > 0 && dias.every(d => !Number(d.Horas ?? 0))

  /** El que más horas hizo de toda la semana, para el encabezado. */
  const mayor = useMemo(
    () =>
      dias.reduce<IOvertimeTopEmployeeDay | null>(
        (m, d) => (Number(d.Horas ?? 0) > Number(m?.Horas ?? 0) ? d : m),
        null,
      ),
    [dias],
  )

  const anchoTarjeta = width - 48

  // Cada día ocupa UNA columna, pero apilada: el ancho se calcula igual que en
  // los demás.
  const medidas = useMemo(
    () => medidasColumnas(dias.length, anchoTarjeta),
    [dias.length, anchoTarjeta],
  )

  const columnas = useMemo(
    () =>
      dias.map(d => {
        const suyas = Number(d.Horas ?? 0)
        const delDia = Number(d.Horas_Dia ?? 0)
        const resto = Math.max(0, delDia - suyas)

        return {
          // El día arriba y el nombre abajo, en dos renglones, así el nombre se
          // lee sin tocar la columna.
          //
          // SOLO EL DÍA, sin la fecha: el segundo renglón ya se lo lleva el
          // nombre, y con tres datos por columna —día, fecha y persona— la
          // etiqueta pedía más ancho del que la columna tiene y el nombre
          // terminaba recortado, que es justamente el dato.
          //
          // Los otros dos gráficos por día sí llevan la fecha: ahí el segundo
          // renglón está libre.
          label: `${diaCorto(d.Fecha)}\n${
            suyas > 0 ? nombreCorto(d.Employee_Name) : 'Sin horas'
          }`,
          // ACÁ ESTABA EL CRASH: un día sin horas trae los dos tramos en
          // cero, el filtro los quitaba a los dos y la columna quedaba sin
          // ninguno. Y no es un caso raro: los días sin horas vienen siempre.
          stacks: tramosApilados([
            { value: suyas, color: COLOR_GASTADO },
            { value: resto, color: COLOR_GASTADO_SUAVE },
          ]),
        }
      }),
    [dias],
  )

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={2}>
            Empleado con más horas extra por día
          </Text>
          {/* El de toda la semana, que es lo que uno iba a buscar columna por
              columna. */}
          {!cargando && !!mayor && Number(mayor.Horas ?? 0) > 0 && (
            <Text fontSize={9} color="$textMuted" numberOfLines={1}>
              El mayor: {nombreCorto(mayor.Employee_Name)} · {fmtHoras(mayor.Horas)} el{' '}
              {diaCorto(mayor.Fecha)} {fechaCorta(mayor.Fecha)}
            </Text>
          )}
        </YStack>

        <View
          padding="$1.5"
          borderRadius={999}
          opacity={cargando ? 0.35 : 1}
          pressStyle={cargando ? undefined : { opacity: 0.5 }}
          onPress={cargando ? undefined : cargar}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </View>
      </XStack>

      {cargando ? (
        <EsqueletoDias />
      ) : error ? (
        <YStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$5">
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {error}
          </Text>
          <View
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius="$3"
            backgroundColor={`${ACCENT}18`}
            pressStyle={{ opacity: 0.6 }}
            onPress={cargar}
          >
            <Text fontSize={11} fontWeight="800" color={ACCENT}>
              Reintentar
            </Text>
          </View>
        </YStack>
      ) : dias.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Sin días en el período seleccionado.
          </Text>
        </YStack>
      ) : sinHoras ? (
        /* Hay días pero ninguno con horas: se dice con palabras en lugar de
           dibujar siete columnas en cero, que se ven igual que un gráfico
           roto. */
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <Users size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            Nadie hizo horas extra en sus áreas esta semana.
          </Text>
          <Text fontSize={10} color="$textMuted" textAlign="center" lineHeight={14}>
            Solo cuentan las solicitudes que ya pasaron por todas las entidades.
          </Text>
        </YStack>
      ) : (
        <>
          <View width={anchoTarjeta} overflow="hidden">
            <BarChart
              stackData={columnas}
              width={medidas.plot}
              disableScroll={!medidas.scroll}
              height={CHART_H}
              barWidth={medidas.barW}
              spacing={medidas.spacing}
              initialSpacing={BAR_INITIAL}
              noOfSections={4}
              stackBorderTopLeftRadius={3}
              stackBorderTopRightRadius={3}
              yAxisLabelWidth={Y_LABEL_W}
              yAxisTextStyle={{ fontSize: 9, color: muted }}
              labelWidth={medidas.barW + medidas.spacing}
              xAxisLabelTextStyle={{ fontSize: 8, color: muted, textAlign: 'center' }}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={grid}
              rulesColor={grid}
              rulesType="dashed"
              formatYLabel={(valor: string) => {
                const n = Number(valor)
                return n ? `${Math.round(n)}h` : '0'
              }}
            />
          </View>

          <XStack gap="$3" justifyContent="center" flexWrap="wrap">
            <TramoLeyenda color={COLOR_GASTADO} etiqueta="Del que encabeza" />
            <TramoLeyenda color={COLOR_GASTADO_SUAVE} etiqueta="De los demás" />
          </XStack>
        </>
      )}
    </YStack>
  )
}

/**
 * Una tarjeta: el área, quién encabeza y qué parte del área es.
 *
 * TRES RENGLONES y no cinco: el área con su porcentaje, la persona con sus
 * horas, y la barra con el total abajo. En el web hay un renglón más para la
 * posición y otro para las solicitudes; acá no caben sin que la tarjeta pase de
 * cien píxeles de alto, y con seis tarjetas eso es toda la pantalla.
 *
 * Lo que se conservó es lo que contesta la pregunta: el área, el nombre, las
 * horas y contra qué se comparan.
 */
function TarjetaArea({ fila }: { fila: IOvertimeTopEmployee }) {
  const parte = Number(fila.Parte ?? 0)
  const empleados = Number(fila.Empleados_Area ?? 0)

  /**
   * Una sola persona con más de dos tercios del área es algo que vale la pena
   * notar: puede ser un turno especial o alguien cargando el trabajo de todos.
   */
  const concentrado = parte >= 66.67 && empleados > 1
  const unico = empleados <= 1

  /** Iniciales: la del nombre y la del primer apellido. */
  const iniciales = useMemo(() => {
    const texto = String(fila.Employee_Name ?? '')
    const sinCodigo = texto.includes(' - ') ? texto.slice(texto.indexOf(' - ') + 3) : texto
    const partes = sinCodigo.trim().split(/\s+/).filter(Boolean)

    if (partes.length === 0) return '—'
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase()

    const apellido = partes.length === 2 ? partes[1] : partes[partes.length - 2]

    return `${partes[0][0]}${apellido[0]}`.toUpperCase()
  }, [fila.Employee_Name])

  return (
    <YStack
      borderWidth={1}
      borderColor="$border"
      borderRadius="$3"
      padding="$2.5"
      gap={5}
    >
      {/* El área, que es el agrupador */}
      <XStack alignItems="center" gap="$2">
        <Text
          fontSize={9}
          fontWeight="800"
          color="$textMuted"
          letterSpacing={0.3}
          flex={1}
          numberOfLines={1}
        >
          {(fila.Nombre || fila.Codigo || '').trim().toUpperCase()}
        </Text>

        {/* Concentrado: la pastilla se llena de naranja. Antes usaba un ámbar
            propio —tres tonos que no existían en el resto de la pantalla— y
            esta pantalla tiene cuatro colores: no hacía falta un quinto para
            decir 'mire esto'. */}
        <XStack
          paddingHorizontal={5}
          paddingVertical={1}
          borderRadius={999}
          backgroundColor={concentrado ? COLOR_GASTADO : '$backgroundSurface'}
        >
          <Text fontSize={9} fontWeight="800" color={concentrado ? '#FFFFFF' : '$textMuted'}>
            {fmtPct(parte)}
          </Text>
        </XStack>
      </XStack>

      {/* La persona */}
      <XStack alignItems="center" gap="$2">
        {/* Naranja lleno con la letra en blanco. Antes iba con el naranja
            rebajado a un 13% de opacidad y quedaba casi invisible: los colores
            de esta pantalla son cuatro y se usan enteros. */}
        <View
          width={24}
          height={24}
          borderRadius={999}
          backgroundColor={COLOR_GASTADO}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={9} fontWeight="800" color="#FFFFFF">
            {iniciales}
          </Text>
        </View>

        <Text fontSize={12} fontWeight="700" color="$text" flex={1} numberOfLines={1}>
          {nombreCorto(fila.Employee_Name)}
        </Text>

        <Text fontSize={13} fontWeight="800" color={COLOR_GASTADO} fontVariant={['tabular-nums']}>
          {fmtHoras(fila.Horas)}
        </Text>
      </XStack>

      {/* Su parte del área. Sobre 100 y no sobre el área más grande: la
          pregunta es qué parte de SU área es esa persona. */}
      {/* El riel SIN `opacity`. La opacidad de una vista se hereda a sus hijos,
          así que el 0.35 que tenía acá se le aplicaba también a la barra de
          adentro y el naranja salía lavado. El gris del riel sale del token
          —`textDisabled` ya es un gris claro— y no de rebajar el negro. */}
      <View height={4} borderRadius={999} backgroundColor="$textDisabled">
        <View
          height={4}
          borderRadius={999}
          backgroundColor={COLOR_GASTADO}
          width={`${Math.max(2, Math.min(100, parte))}%`}
        />
      </View>

      {/* El total del área SOLO cuando es otro número. Siendo el único con
          horas, su total y el del área son el mismo, y verlo dos veces —'2h 30m'
          arriba, 'de 2h 30m' abajo— hace dudar de si son dos cosas distintas. */}
      <Text fontSize={9} color="$textMuted">
        {unico
          ? 'Único con horas en el área'
          : `de ${fmtHoras(fila.Horas_Area)} entre ${empleados} personas`}
      </Text>
    </YStack>
  )
}

/**
 * Las tres pastillas del corte.
 *
 * MIENTRAS CARGA se dibujan como esqueleto y no se pueden tocar. Antes quedaban
 * vivas —con el argumento de que cambiar de corte es lo que dispara la consulta
 * que falta— pero en la práctica se veían tres pastillas normales sobre una
 * tarjeta vacía, y tocar otra encimaba una segunda consulta sobre la que ya
 * estaba en camino: la que respondiera última ganaba, y podía no ser la del
 * corte marcado.
 *
 * Las comparten las tres tarjetas que cortan por área.
 */
function SelectorCorte({
  activo,
  cargando,
  onCambiar,
}: {
  activo: NivelCorte
  cargando: boolean
  onCambiar: (nivel: NivelCorte) => void
}) {
  if (cargando) {
    return (
      <XStack gap="$1.5">
        {CORTES.map(c => (
          <View
            key={c.nivel}
            flex={1}
            height={22}
            borderRadius={999}
            backgroundColor="$textDisabled"
            opacity={0.25}
          />
        ))}
      </XStack>
    )
  }

  return (
    <XStack gap="$1.5">
      {CORTES.map(c => {
        const sel = c.nivel === activo

        return (
          <View
            key={c.nivel}
            flex={1}
            alignItems="center"
            paddingVertical={5}
            borderRadius={999}
            borderWidth={1}
            borderColor={sel ? ACCENT : '$border'}
            backgroundColor={sel ? `${ACCENT}18` : 'transparent'}
            pressStyle={{ opacity: 0.6 }}
            onPress={() => onCambiar(c.nivel)}
          >
            <Text
              fontSize={9}
              fontWeight={sel ? '800' : '600'}
              color={sel ? ACCENT : '$textMuted'}
              numberOfLines={1}
            >
              {c.pastilla}
            </Text>
          </View>
        )
      })}
    </XStack>
  )
}

/** Tarjetas con la forma de las de arriba: tres renglones y una barra. */
function EsqueletoTarjetasArea() {
  return (
    <YStack gap="$2">
      {[0, 1, 2, 3].map(i => (
        <YStack key={i} borderWidth={1} borderColor="$border" borderRadius="$3" padding="$2.5" gap={5}>
          <XStack alignItems="center" gap="$2">
            <View height={7} width="45%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.3} />
            <View height={11} width={32} borderRadius={999} backgroundColor="$textDisabled" opacity={0.2} />
          </XStack>
          <XStack alignItems="center" gap="$2">
            <View width={24} height={24} borderRadius={999} backgroundColor="$textDisabled" opacity={0.3} />
            <View height={9} width="40%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.3} />
          </XStack>
          <View height={4} borderRadius={999} backgroundColor="$textDisabled" opacity={0.25} />
          <View height={7} width="55%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.2} />
        </YStack>
      ))}
    </YStack>
  )
}

/**
 * Un renglón: quién, cuánto, y la barra con su proporción.
 *
 * El costo va junto a las horas pero apagado y más chico: la pregunta de esta
 * pestaña es quién se está quedando, no cuánto cuesta. Dos personas con las
 * mismas horas cuestan distinto según su salario, y si el costo mandara, la
 * lista dejaría de contestar la pregunta.
 */
function RenglonEmpleado({
  nombre,
  detalle,
  horas,
  costo,
  parte,
  color = COLOR_HORAS,
}: {
  nombre: string
  detalle: string
  horas: string
  costo: string
  /** Qué parte del que más hizo, en porcentaje. */
  parte: number
  /**
   * El color de la barra. Por omisión el verde de las horas.
   *
   * TODAS las barras del mismo color, como en el web: la lista ya viene
   * ordenada, así que resaltar al primero no agrega nada y hacía dudar de si
   * ese renglón significaba algo distinto de los demás.
   */
  color?: string
}) {
  return (
    <YStack gap={4}>
      <XStack alignItems="flex-end" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={1}>
            {nombre}
          </Text>
          {!!detalle && (
            <Text fontSize={9} color="$textMuted" numberOfLines={1}>
              {detalle}
            </Text>
          )}
        </YStack>

        <XStack alignItems="baseline" gap={5} flexShrink={0}>
          <Text fontSize={12} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
            {horas}
          </Text>
          <Text fontSize={9} color="$textMuted" fontVariant={['tabular-nums']}>
            {costo}
          </Text>
        </XStack>
      </XStack>

      {/* Riel en `$textDisabled` y NO en `$backgroundHover`: este tema no
          define ese token y se resolvía a transparente, así que la barra
          quedaba sin nada contra qué compararse.

          Y SIN `opacity`: la opacidad de una vista se hereda a sus hijos, así
          que el 0.35 que tenía acá se le aplicaba también a la barra de adentro
          y el color salía lavado. El gris sale del token, que ya es claro. */}
      <View height={6} borderRadius={999} backgroundColor="$textDisabled">
        <View
          height={6}
          borderRadius={999}
          backgroundColor={color}
          // Un mínimo visible: quince minutos al lado de doce horas dan una
          // barra de medio pixel, que se lee como cero.
          width={`${Math.max(2, Math.min(100, parte))}%`}
        />
      </View>
    </YStack>
  )
}

/**
 * Renglones con la forma de los de arriba: dos líneas y una barra.
 *
 * Dibuja TANTOS como va a mostrar la lista, no una cantidad fija: con seis
 * esqueletos y ocho renglones de contenido, la tarjeta crecía al llegar los
 * datos y empujaba hacia abajo todo lo que venía después.
 */
function EsqueletoRenglones({ filas = 6 }: { filas?: number }) {
  return (
    <YStack gap="$2.5">
      {Array.from({ length: filas }, (_, i) => i).map(i => (
        <YStack key={i} gap={4}>
          <XStack alignItems="center" gap="$2">
            <YStack flex={1} gap={3}>
              <View height={9} width="60%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.3} />
              <View height={7} width="40%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.2} />
            </YStack>
            <View height={9} width={54} borderRadius={3} backgroundColor="$textDisabled" opacity={0.3} />
          </XStack>
          <View
            height={6}
            // Decrecientes repartidas en el largo de la lista, como el
            // contenido que viene ordenado de más a menos.
            width={`${Math.max(12, 92 - (i * 70) / Math.max(1, filas - 1))}%`}
            borderRadius={999}
            backgroundColor="$textDisabled"
            opacity={0.25}
          />
        </YStack>
      ))}
    </YStack>
  )
}

// ── Diálogo: los empleados que están detrás de una columna ──────────────────
//
// La columna dice CUÁNTO se gastó; esto dice QUIÉN, que es lo que hace falta
// para hacer algo al respecto. Los empleados vienen ordenados por costo desde
// la base: el primero de la lista es el que más pesa.
//
// SIRVE PARA LAS DOS TARJETAS —el gasto de un área y el de un día— porque la
// lista es la misma pregunta: quién puso ese gasto. Lo único que cambia es el
// encabezado, así que va por props en lugar de tener dos modales casi iguales
// que después hay que arreglar dos veces.
//
// Sube DESDE ABAJO, que es donde el pulgar ya está.
function DesgloseEmpleados({
  abierto,
  titulo,
  subtitulo,
  destacado,
  destacadoRotulo,
  empleados,
  cargando,
  error,
  vacio,
  onCerrar,
}: {
  abierto: boolean
  titulo: string
  /** Qué se está mirando: el gasto que motivó abrirlo y cuánta gente hay. */
  subtitulo: string
  /** Un dato que merece su propio renglón, como el área que más gastó. */
  destacado?: string
  destacadoRotulo?: string
  empleados: IOvertimeBudgetEmployee[]
  cargando: boolean
  error: string
  /** Qué decir cuando la consulta salió bien y no hay nadie. */
  vacio: string
  onCerrar: () => void
}) {
  const totalHoras = empleados.reduce((acc, e) => acc + Number(e.Horas ?? 0), 0)
  const totalCosto = empleados.reduce((acc, e) => acc + Number(e.Costo ?? 0), 0)

  return (
    <Modal visible={abierto} transparent animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="flex-end">
        <YStack
          backgroundColor="$backgroundElevated"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          paddingHorizontal="$4"
          paddingTop="$4"
          paddingBottom="$5"
          maxHeight="85%"
          gap="$3"
        >
          <YStack gap={2}>
            <Text fontSize={15} fontWeight="800" color="$text" numberOfLines={2}>
              {titulo}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {subtitulo}
            </Text>
          </YStack>

          {/* El dato destacado en su propio renglón. Salió del eje del gráfico
              —ahí el nombre había que recortarlo tanto que no servía— y acá va
              completo, con su monto. */}
          {!!destacado && (
            <XStack
              alignItems="center"
              gap="$2"
              paddingHorizontal="$2.5"
              paddingVertical="$2"
              borderRadius="$3"
              backgroundColor={`${COLOR_GASTADO}18`}
              borderWidth={1}
              borderColor={`${COLOR_GASTADO}55`}
            >
              <TrendingUp size={14} color={COLOR_GASTADO} />
              <YStack flex={1} minWidth={0}>
                {!!destacadoRotulo && (
                  <Text fontSize={8} fontWeight="800" color={COLOR_GASTADO} letterSpacing={0.5}>
                    {destacadoRotulo}
                  </Text>
                )}
                <Text fontSize={11} color="$text" numberOfLines={2}>
                  {destacado}
                </Text>
              </YStack>
            </XStack>
          )}

          {/* Totales de lo que se está mirando, para poder contrastar contra el
              presupuesto */}
          <XStack
            justifyContent="space-between"
            backgroundColor="$backgroundSurface"
            borderRadius="$4"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <YStack>
              <Text fontSize={9} color="$textMuted">
                Horas
              </Text>
              <Text fontSize={14} fontWeight="800" color="$text">
                {fmtHoras(totalHoras)}
              </Text>
            </YStack>
            <YStack alignItems="flex-end">
              <Text fontSize={9} color="$textMuted">
                Costo
              </Text>
              <Text fontSize={14} fontWeight="800" color={COLOR_GASTADO}>
                {fmtDinero(totalCosto)}
              </Text>
            </YStack>
          </XStack>

          {cargando ? (
            // Filas con la forma de las de abajo, no el esqueleto genérico:
            // dentro de un diálogo chico, unas barras que no se parecen a la
            // lista se ven como un error de carga.
            <YStack gap="$3" paddingVertical="$2">
              {[0, 1, 2].map(i => (
                <XStack key={i} alignItems="center" gap="$2">
                  <YStack flex={1} gap={4}>
                    <SkeletonBox width="70%" height={12} />
                    <SkeletonBox width="45%" height={9} />
                  </YStack>
                  <YStack alignItems="flex-end" gap={4}>
                    <SkeletonBox width={60} height={12} />
                    <SkeletonBox width={40} height={9} />
                  </YStack>
                </XStack>
              ))}
            </YStack>
          ) : error ? (
            <Text fontSize={12} color={COLOR_EXCEDIDO} lineHeight={17}>
              {error}
            </Text>
          ) : empleados.length === 0 ? (
            <Text fontSize={12} color="$textMuted" lineHeight={17}>
              {vacio}
            </Text>
          ) : (
            <FlatList
              data={empleados}
              keyExtractor={e => e.Employee_Code}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => (
                <View height={1} backgroundColor="$border" opacity={0.5} />
              )}
              renderItem={({ item }) => (
                <YStack paddingVertical="$2.5" gap="$1.5">
                  <XStack gap="$2" alignItems="center">
                    <YStack flex={1} minWidth={0}>
                      <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={1}>
                        {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
                      </Text>
                      <Text fontSize={9} color="$textMuted" numberOfLines={1}>
                        {[item.Posicion, item.Centro_Costos].filter(Boolean).join(' · ')}
                      </Text>
                    </YStack>

                    <YStack alignItems="flex-end">
                      <Text fontSize={12} fontWeight="800" color="$text">
                        {fmtDinero(item.Costo)}
                      </Text>
                      <Text fontSize={9} color="$textMuted">
                        {fmtHoras(item.Horas)} · {item.Solicitudes} sol.
                      </Text>
                    </YStack>
                  </XStack>

                  {/* En qué banda cayeron SUS horas. Es el mismo componente de
                      las bandejas de aprobación, así que el empleado ve el
                      reparto igual en todas las pantallas. */}
                  <DistribucionHoras conceptos={parseConceptos(item.ConceptsJson)} compacta />
                </YStack>
              )}
            />
          )}

          <Button backgroundColor="$backgroundSurface" onPress={onCerrar}>
            <Text fontWeight="700" color="$text">
              Cerrar
            </Text>
          </Button>
        </YStack>
      </View>
    </Modal>
  )
}

/** Una de las tres columnas de cifras. */
function CifraPresupuesto({
  etiqueta,
  monto,
  detalle,
  color,
}: {
  etiqueta: string
  monto: string
  detalle: string
  color?: string
}) {
  return (
    <YStack flex={1} alignItems="center" paddingVertical="$2" paddingHorizontal={2} gap={1}>
      <Text fontSize={8} fontWeight="800" color="$textMuted" letterSpacing={0.5}>
        {etiqueta}
      </Text>
      {/* El monto se ADAPTA en lugar de recortarse: 'L 1,234,567' en un tercio
          de pantalla no entra, y verlo un punto más chico es mejor que verlo
          como 'L 1,23…'. */}
      <Text
        fontSize={13}
        fontWeight="800"
        color={color ?? '$text'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {monto}
      </Text>
      <Text fontSize={8} color="$textMuted" numberOfLines={1}>
        {detalle}
      </Text>
    </YStack>
  )
}

/**
 * Un renglón de leyenda: color, qué es y cuánto.
 *
 * Va debajo de las donas y no como leyenda del gráfico: trae el MONTO de cada
 * gajo, incluido el que se quedó sin porcentaje adentro por ser chico.
 */
function RenglonLeyenda({
  color,
  etiqueta,
  monto,
}: {
  color: string
  etiqueta: string
  monto: string
}) {
  return (
    <XStack alignItems="center" gap="$2">
      <View width={9} height={9} borderRadius={3} backgroundColor={color} />
      <Text fontSize={11} color="$text" flex={1}>
        {etiqueta}
      </Text>
      <Text fontSize={11} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
        {monto}
      </Text>
    </XStack>
  )
}

function SeparadorVertical() {
  return <View width={1} backgroundColor="$border" opacity={0.6} />
}

/**
 * Esqueleto con la FORMA de lo que viene —tres cifras y un anillo— y no un
 * spinner: así el espacio ya está tomado y el contenido no salta al llegar.
 */
function EsqueletoPresupuesto({ radio }: { radio: number }) {
  return (
    <YStack gap="$2.5" alignItems="center">
      <XStack width="100%" borderTopWidth={1} borderBottomWidth={1} borderColor="$border">
        {[0, 1, 2].map(i => (
          <XStack key={i} flex={1}>
            {i > 0 && <SeparadorVertical />}
            <YStack flex={1} alignItems="center" paddingVertical="$2" gap={3}>
              <View height={7} width="55%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.3} />
              <View height={11} width="80%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.35} />
              <View height={7} width="65%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.25} />
            </YStack>
          </XStack>
        ))}
      </XStack>

      <View
        width={radio * 2}
        height={radio * 2}
        borderRadius={999}
        borderWidth={radio * 0.48}
        borderColor="$textDisabled"
        opacity={0.3}
      />

      <YStack width="100%" gap="$1.5">
        {[0, 1].map(i => (
          <View key={i} height={9} width="70%" borderRadius={3} backgroundColor="$textDisabled" opacity={0.25} />
        ))}
      </YStack>
    </YStack>
  )
}

// ── Selector de sección ─────────────────────────────────────────────────────
//
// Tres botones segmentados, del mismo largo, dentro de una sola tarjeta. No es
// una barra de pestañas con subrayado: en un teléfono el subrayado es un blanco
// chico para el dedo y no se ve cuál está activo si la pantalla está a contraluz.
//
// LETRA CHICA —10px— y sin ícono: 'Presupuesto HE' es la etiqueta más larga y a
// un tercio del ancho de un teléfono no entra en un cuerpo más grande. Se
// probó recortarla a 'Presupuesto' pero se confunde con la de alimentación, que
// también es un presupuesto.
function SelectorSeccion({
  activo,
  onCambiar,
}: {
  activo: number
  onCambiar: (i: number) => void
}) {
  return (
    <XStack
      padding={4}
      gap={4}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      {...shadows.sm}
    >
      {SECCIONES.map((s, i) => {
        const sel = i === activo

        return (
          <XStack
            key={s.key}
            flex={1}
            alignItems="center"
            justifyContent="center"
            paddingVertical="$2"
            borderRadius="$3"
            backgroundColor={sel ? ACCENT : 'transparent'}
            pressStyle={{ opacity: 0.7 }}
            onPress={() => onCambiar(i)}
          >
            <Text
              fontSize={10}
              fontWeight={sel ? '800' : '600'}
              color={sel ? '#FFFFFF' : '$textMuted'}
              numberOfLines={1}
            >
              {s.label}
            </Text>
          </XStack>
        )
      })}
    </XStack>
  )
}

// ── Esqueleto de una sección ────────────────────────────────────────────────
//
// Se deja aunque las secciones estén vacías: el filtro de semana sí consulta, y
// sin nada que cambie mientras responde el toque en las flechas parece no haber
// hecho efecto.
function EsqueletoSeccion() {
  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3.5"
      gap="$2.5"
      {...shadows.sm}
    >
      <View height={12} width="55%" borderRadius={4} backgroundColor="$textDisabled" opacity={0.35} />
      <View height={9} width="90%" borderRadius={4} backgroundColor="$textDisabled" opacity={0.25} />
      <View height={9} width="75%" borderRadius={4} backgroundColor="$textDisabled" opacity={0.25} />
    </YStack>
  )
}

// ── Selector de semana ──────────────────────────────────────────────────────
//
// Flechas en vez de desplegable: moverse de semana es lo que más se hace en
// esta pantalla, y con una lista había que abrirla, buscar y elegir para llegar
// a la de al lado. Acá es un toque.
//
// La lista viene SIN semanas futuras, así que la flecha derecha se apaga en la
// semana en curso — no hay para dónde avanzar y un botón que no hace nada
// confunde más que uno apagado.
function SelectorSemana({
  semanas,
  actual,
  onCambiar,
}: {
  semanas: IPayWebWeek[]
  actual: IPayWebWeek | null
  onCambiar: (w: IPayWebWeek) => void
}) {
  const i = actual ? semanas.findIndex(w => claveSemana(w) === claveSemana(actual)) : -1

  const anterior = i > 0 ? semanas[i - 1] : null
  const siguiente = i >= 0 && i < semanas.length - 1 ? semanas[i + 1] : null

  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''

  return (
    <XStack
      alignItems="center"
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$1.5"
      paddingHorizontal="$1.5"
      {...shadows.sm}
    >
      <View
        padding="$2"
        borderRadius={999}
        opacity={anterior ? 1 : 0.25}
        pressStyle={anterior ? { opacity: 0.5 } : undefined}
        onPress={() => anterior && onCambiar(anterior)}
      >
        <ChevronLeft size={20} color="#94A3B8" />
      </View>

      <YStack flex={1} alignItems="center" gap={1}>
        <XStack alignItems="center" gap="$1.5">
          <Text fontSize={14} fontWeight="800" color="$text">
            Semana {actual?.WeekNumber ?? '—'}
          </Text>
          {!!actual?.IsCurrentWeek && (
            <XStack backgroundColor={`${ACCENT}22`} paddingHorizontal={6} paddingVertical={1} borderRadius={6}>
              <Text fontSize={9} fontWeight="800" color={ACCENT}>
                ACTUAL
              </Text>
            </XStack>
          )}
        </XStack>
        <Text fontSize={10} color="$textMuted">
          {corta(actual?.InitialDate ?? null)} — {corta(actual?.FinalDate ?? null)}
        </Text>
      </YStack>

      <View
        padding="$2"
        borderRadius={999}
        opacity={siguiente ? 1 : 0.25}
        pressStyle={siguiente ? { opacity: 0.5 } : undefined}
        onPress={() => siguiente && onCambiar(siguiente)}
      >
        <ChevronRight size={20} color="#94A3B8" />
      </View>
    </XStack>
  )
}
