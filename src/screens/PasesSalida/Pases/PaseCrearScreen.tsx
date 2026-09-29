import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions, Keyboard, KeyboardAvoidingView, Modal, Platform,
  ScrollView as RNScrollView, SectionList, TextInput,
} from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
// `Lock` se renombra: choca con el tipo global Lock del DOM y TS resuelve ese.
import { ArrowLeft, Check, Plus, Trash2, Package, TriangleAlert, Boxes, Lock as LockIcon } from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import AppDatePicker from '../../../components/commons/AppDatePicker'
import SearchInput from '../../../components/commons/SearchInput'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import SkeletonForm from '../../../components/Skeletons/SkeletonForm'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import {
  ACCENT, ACCENT_BG, ACCESO_REGRESO_PARCIAL, ACCESO_UNIDAD_GENERAL,
  CLAVE_HORAS_GRACIA, UNIDADES, fechaMinimaSalida, tieneAcceso,
} from '../pasesSalida.helpers'
import { useAuth } from '../../../context/AuthContext'
import { configuracionService } from '../../../api/modules/configuracion/configuracion.service'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import { pasesSalidaService } from '../../../api/modules/pasesSalida/pasesSalida.service'
import { ITipoSalida, IMaterial } from '../../../api/modules/pasesSalida/pasesSalida.types'
import { IReglaResumen, motivoBloqueo } from '../../../api/modules/pasesSalida/configuracion.types'

/**
 * Alta de un pase de salida.
 *
 * Dos reglas que definen la pantalla:
 *
 * 1. La lista de materiales YA viene filtrada por el alcance del solicitante
 *    (api/PasesSalida/MisMateriales), así que acá no hay nada que decidir sobre
 *    permisos: lo que se ve es lo que se puede pedir.
 *
 * 2. Un material marcado como EQUIPO pide marca, modelo y serie; el resto solo
 *    marca. La bandera viene del catálogo, no de una lista de nombres, y el SP
 *    valida lo mismo: acá se valida para no ir al servidor a que rebote.
 *
 * 3. No todo sale bajo cualquier tipo: una herramienta no se dona. Eso lo dice
 *    la configuración (grupo × tipo de salida) y por eso el TIPO SE ELIGE
 *    PRIMERO — sin él no se puede saber qué materiales son válidos, y dejar
 *    agregar a ciegas para rebotar al guardar es hacerle perder el trabajo.
 *
 * No se captura fecha de retorno: esa es la fecha en que la cosa REGRESÓ y la
 * llena el proceso de retorno.
 */

/** Una línea en edición. Todo texto porque viene de inputs. */
type Linea = {
  Material_Id: number
  Material: string
  /** El grupo fija la cadena de firmas; todas las líneas comparten el mismo. */
  Grupo_Id: number | null
  Grupo: string | null
  EsEquipo: boolean
  Descripcion: string
  Cantidad: string
  UnidadMedida: string
  Marca: string
  Modelo: string
  Serie: string
  /**
   * Esta línea puede volver por partes. Solo se pregunta cuando el tipo de
   * salida exige retorno y el solicitante tiene el acceso; en cualquier otro
   * caso viaja como null y el servidor lo ignora.
   */
  RegresoParcial: boolean
}

const LINEA_VACIA = (m: IMaterial): Linea => ({
  Material_Id: m.Id,
  Material: m.Name,
  Grupo_Id: m.Grupo_Id ?? null,
  Grupo: m.Grupo ?? null,
  EsEquipo: !!m.EsEquipo,
  Descripcion: '',
  Cantidad: '1',
  UnidadMedida: 'Unidad',
  Marca: '',
  Modelo: '',
  Serie: '',
  RegresoParcial: false,
})

/** Alto del footer fijo: el scroll reserva ese espacio para no quedar tapado. */
const FOOTER_H = 108

/** Aire entre el campo y el borde del teclado, para que no quede pegado. */
const HOLGURA = 24

/**
 * El teclado, resuelto para ESTA pantalla.
 *
 * ── POR QUÉ NO SE USA KeyboardAwareForm ────────────────────────────────────
 * El componente común hace bien la parte difícil —medir el campo y subir solo
 * el solape— pero fija dos props que acá estorban:
 *
 *   keyboardDismissMode="on-drag"        arrastrar para ver un campo tapado
 *                                        CIERRA el teclado. En Android, que es
 *                                        donde más se arrastra, deja al usuario
 *                                        peleando contra la pantalla.
 *   keyboardShouldPersistTaps="handled"  tocar fuera de un campo también lo
 *                                        cierra.
 *
 * En un formulario de dos campos eso no se nota. Acá hay hasta seis campos por
 * línea y varias líneas: el teclado tiene que quedarse abierto mientras se
 * llena, y el usuario se mueve tocando el campo siguiente, no arrastrando.
 *
 * Por eso esta pantalla lleva su propia versión, con la misma mecánica y otras
 * dos props. El componente común NO se toca: lo usan Repuestos, Cooperativa,
 * Gastos de viaje y Usuarios, y ahí las dos props que acá molestan son las
 * correctas.
 *
 * ── LA MECÁNICA, QUE ES LA MISMA ───────────────────────────────────────────
 * iOS  KeyboardAvoidingView con behavior="padding".
 * Android  padding dinámico igual al alto del teclado: con edge-to-edge el
 *          teclado se dibuja ENCIMA y la ventana no se achica, así que sin ese
 *          padding no hay a dónde desplazarse.
 * Los dos  al enfocar un campo se mide dónde quedó y se sube SOLO el solape.
 *          Un scrollToEnd se iría hasta el final del padding y dejaría un hueco.
 */
const useTecladoDelFormulario = () => {
  const scrollRef = useRef<RNScrollView>(null)
  const scrollY = useRef(0)
  /* Borde superior del teclado. Se guarda porque al saltar de un campo a otro
     con el teclado YA abierto no vuelve a llegar ningún evento. */
  const bordeTeclado = useRef(0)
  const [kbAlto, setKbAlto] = useState(0)

  const subir = useCallback((borde?: number) => {
    const b = borde ?? bordeTeclado.current
    if (b <= 0) return
    /* El padding dinámico entra en el mismo render que kbAlto; el retraso le da
       tiempo a que el scroll tenga a dónde ir. */
    setTimeout(() => {
      let node: any = null
      try { node = (TextInput as any)?.State?.currentlyFocusedInput?.() } catch { node = null }
      if (!node?.measureInWindow) return
      node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const solape = y + h + HOLGURA - b
        if (solape > 0) {
          scrollRef.current?.scrollTo({ y: scrollY.current + solape, animated: true })
        }
      })
    }, 120)
  }, [])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const alto = e.endCoordinates?.height ?? 0
      setKbAlto(alto)
      const borde = e.endCoordinates?.screenY ?? Dimensions.get('window').height - alto
      bordeTeclado.current = borde
      subir(borde)
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKbAlto(0)
      bordeTeclado.current = 0
    })
    return () => { show.remove(); hide.remove() }
  }, [subir])

  return {
    scrollRef,
    /** Para el onScroll: hace falta saber dónde está para sumarle el solape. */
    onScroll: (e: any) => { scrollY.current = e.nativeEvent.contentOffset.y },
    /** Espacio extra al fondo. Solo Android lo necesita. */
    paddingTeclado: Platform.OS === 'android' ? kbAlto : 0,
    /** Para el onFocus de cada campo: cubre el salto con el teclado ya abierto. */
    subirCampo: useCallback(() => subir(), [subir]),
  }
}

const HOY = () => dayjs().format('YYYY-MM-DD')

/**
 * Devuelve el problema de la línea, o null si está bien.
 *
 * Con unidad general la cantidad no se pide: lo que se quita es la medida, no
 * la identificación de lo que sale.
 */
const validarLinea = (l: Linea, unidadGeneral: boolean): string | null => {
  if (!l.Descripcion.trim()) return 'Falta la descripción del producto'
  if (!unidadGeneral) {
    const cant = Number(l.Cantidad.replace(',', '.'))
    if (!l.Cantidad.trim() || isNaN(cant) || cant <= 0) return 'La cantidad tiene que ser mayor que cero'
  }
  if (!l.Marca.trim()) return 'Falta la marca'
  if (l.EsEquipo && !l.Modelo.trim()) return 'Es equipo: falta el modelo'
  if (l.EsEquipo && !l.Serie.trim()) return 'Es equipo: falta la serie'
  return null
}

export default function PaseCrearScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { showToast } = useShowToast()
  const { user } = useAuth()
  /* `subirCampo` va en el onFocus de cada campo: con el teclado YA abierto,
     saltar a otro campo no vuelve a disparar el evento del teclado, así que sin
     esto el campo nuevo puede quedar debajo. En un pase con varias líneas eso
     pasa todo el tiempo — se va de Descripción a Cantidad a Marca sin cerrar el
     teclado nunca. */
  const { scrollRef, onScroll, paddingTeclado, subirCampo } = useTecladoDelFormulario()

  // Con id se está EDITANDO un pase pendiente; sin id se está creando.
  const paseId: number | undefined = route.params?.id
  const esEdicion = typeof paseId === 'number' && paseId > 0

  /* Sin el acceso el checkbox ni se dibuja. El SP lo revalida: mandar la
     bandera en true sin tenerlo no habilita nada. */
  const conUnidadGeneral = tieneAcceso(user?.Access, ACCESO_UNIDAD_GENERAL)
  const conRegresoParcial = tieneAcceso(user?.Access, ACCESO_REGRESO_PARCIAL)

  const [tipos, setTipos] = useState<ITipoSalida[]>([])
  // Qué grupo puede salir con qué tipo. Tabla chica: se trae entera y se
  // resuelve en memoria cada vez que cambia el tipo o el grupo del pase.
  const [reglas, setReglas] = useState<IReglaResumen[]>([])
  /**
   * La fecha más vieja que el formulario acepta. Sale de las horas de gracia
   * configuradas, no de "hoy": con 24 h de gracia un pase fechado ayer sigue
   * siendo válido todo el día de hoy y tiene que poder editarse.
   *
   * Arranca en hoy —el valor estricto— y se afloja cuando llega la
   * configuración. Al revés se ofrecería una fecha que quizá no corresponde.
   */
  const [fechaMinima, setFechaMinima] = useState<string>(HOY())
  const [materiales, setMateriales] = useState<IMaterial[]>([])
  const [matFiltrados, setMatFiltrados] = useState<IMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // Encabezado. Tipo y fecha viajan como string porque así los manejan
  // AppSelect (Option.value es string) y AppDatePicker ('YYYY-MM-DD').
  const [tipoId, setTipoId] = useState<string>('')
  const [fechaSalida, setFechaSalida] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [enviadoA, setEnviadoA] = useState('')
  // Quién retira. No es el solicitante: puede ser un motorista o alguien sin
  // usuario en IMCore, así que va a mano.
  const [responsable, setResponsable] = useState('')
  const [comentario, setComentario] = useState('')
  /**
   * El pase se captura sin cantidad ni unidad. Es del PASE entero, no de la
   * línea: un pase donde unas líneas tienen cantidad y otras no deja al guardia
   * sin saber si eso es la regla o un dato que falta.
   */
  const [unidadGeneral, setUnidadGeneral] = useState(false)

  // Detalle
  const [lineas, setLineas] = useState<Linea[]>([])
  /**
   * Los índices de las líneas que rebotaron al guardar, para pintarlas en rojo
   * unos segundos.
   *
   * El toast nombra UNA línea, pero si faltan campos en tres se marcan las
   * tres: decir "Línea 1" y que al arreglarla vuelva a rebotar en la 2 es
   * hacerle descubrir el trabajo de a poco.
   */
  const [lineasMalas, setLineasMalas] = useState<number[]>([])
  /* El temporizador va en una ref y no en el efecto de `lineasMalas`: la
     limpieza de un efecto corre en CADA cambio de la dependencia, así que
     tocar un campo mientras la marca está puesta cancelaría el borrado y el
     rojo se quedaría pegado. */
  const marcaRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const marcarLineas = useCallback((indices: number[]) => {
    if (marcaRef.current) clearTimeout(marcaRef.current)
    setLineasMalas(indices)
    marcaRef.current = setTimeout(() => setLineasMalas([]), 4000)
  }, [])

  useEffect(() => () => { if (marcaRef.current) clearTimeout(marcaRef.current) }, [])
  const [matOpen, setMatOpen] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [rTipos, rMat, rReglas, rConfig] = await Promise.all([
        /* Los tipos del USUARIO, no el catálogo entero: cada solicitante tiene
           configurado con qué motivos puede sacar. Si acá se ofreciera todo, el
           rebote llegaría recién al guardar. */
        pasesSalidaService.getMisTiposSalida(),
        pasesService.getMisMateriales(),
        pasesService.getReglas(),
        configuracionService.getAll(),
      ])
      const tps = rTipos.Data ?? []
      setTipos(tps)
      /* Con una sola opción no hay nada que elegir: se deja puesta. En edición
         no, porque el pase trae la suya y pisarla sería cambiarle el tipo al
         usuario sin que lo pida. */
      if (!esEdicion && tps.length === 1) setTipoId(String(tps[0].Id))
      setReglas(rReglas.Data ?? [])
      /* Las horas de gracia son globales (no hay override por grupo: eso es el
         horario). Si la lectura falla, `fechaMinimaSalida` cae en hoy. */
      const gracia = Number(
        (rConfig.Data ?? []).find(c => c.Clave === CLAVE_HORAS_GRACIA)?.Valor,
      )
      setFechaMinima(fechaMinimaSalida(gracia))
      const mats = rMat.Data ?? []
      setMateriales(mats); setMatFiltrados(mats)

      if (!esEdicion) return

      // EsEquipo sale del detalle y no del catálogo: si un material dejó de
      // estar en el alcance, no vendría en la lista y la línea perdería la
      // regla de modelo y serie.
      const [rPase, rDet] = await Promise.all([
        pasesService.getPase(paseId!),
        pasesService.getDetalle(paseId!),
      ])
      const p = rPase.Data?.[0]
      if (p) {
        setTipoId(String(p.TipoSalida_Id))
        setFechaSalida(p.FechaSalida ? dayjs(p.FechaSalida).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'))
        setEnviadoA(p.EnviadoA ?? '')
        setResponsable(p.Responsable ?? '')
        setComentario(p.Comentario ?? '')
      }
      const det = rDet.Data ?? []
      /* Si las líneas vienen sin cantidad, el pase se creó con unidad general.
         No hace falta guardar la bandera aparte: la ausencia de cantidad ES el
         dato. */
      setUnidadGeneral(det.length > 0 && det.every(d => d.Cantidad == null))

      setLineas(det.map(d => ({
        Material_Id: d.Material_Id,
        Material: d.Material,
        // El grupo se toma del catálogo del usuario; si el material dejó de
        // estar en su alcance queda null y la línea existente no se toca.
        Grupo_Id: mats.find(m => m.Id === d.Material_Id)?.Grupo_Id ?? null,
        Grupo: mats.find(m => m.Id === d.Material_Id)?.Grupo ?? null,
        EsEquipo: !!d.EsEquipo,
        Descripcion: d.Descripcion ?? '',
        Cantidad: String(d.Cantidad ?? ''),
        UnidadMedida: d.UnidadMedida || 'Unidad',
        Marca: d.Marca ?? '',
        Modelo: d.Modelo ?? '',
        Serie: d.Serie ?? '',
        // null = no aplicaba; para el formulario es lo mismo que "no marcada".
        RegresoParcial: d.RegresoParcial === true,
      })))
      setError(null)
    } catch (e) {
      setTipos([]); setMateriales([]); setMatFiltrados([])
      setError(handleError(e))
    }
  }, [esEdicion, paseId])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])

  /**
   * El grupo queda fijado por la primera línea: un pase solo lleva materiales
   * de un grupo, porque el grupo ES la cadena de firmas. Al quitar todas las
   * líneas se libera y se puede empezar con otro.
   */
  const grupoFijo = lineas.length ? lineas[0].Grupo_Id : null
  const grupoNombre = lineas.length ? lineas[0].Grupo : null

  const tipoIdNum = tipoId ? Number(tipoId) : null
  const tipoNombre = tipos.find(t => String(t.Id) === tipoId)?.Name ?? ''
  /* Marcar regreso parcial solo tiene sentido si lo que sale tiene que volver.
     Con el tipo equivocado la casilla ni aparece, y el servidor limpia lo que
     hubiera quedado marcado de antes. */
  const preguntarParcial =
    conRegresoParcial && tipos.find(t => String(t.Id) === tipoId)?.Retorna === true

  /**
   * Por qué un material no se puede agregar, o null si sí se puede.
   *
   * Los bloqueados NO se sacan de la lista: esconderlos haría creer que el
   * material no existe o que no se tiene acceso; verlo en gris con el motivo
   * dice la verdad — está, pero no en este pase.
   */
  type Motivo = 'otroGrupo' | 'noPermitido' | 'sinConfigurar'
  const bloqueoDe = (m: IMaterial): Motivo | null => {
    // El grupo del pase manda primero: es la razón más concreta y la que el
    // usuario puede resolver quitando líneas.
    if (grupoFijo != null && m.Grupo_Id !== grupoFijo) return 'otroGrupo'
    return motivoBloqueo(reglas, m.Grupo_Id, tipoIdNum)
  }

  const TEXTO_MOTIVO: Record<Motivo, string> = {
    otroGrupo: 'Otro grupo · no se puede agregar a este pase',
    noPermitido: `No se permite sacar esto con "${tipoNombre}"`,
    sinConfigurar: `Sin firmas configuradas para "${tipoNombre}"`,
  }

  /**
   * El pase ya armado dejó de ser válido porque cambiaron el tipo de salida
   * después de agregar los materiales. Se avisa arriba del detalle en vez de
   * borrarles las líneas: quitar trabajo ajeno sin preguntar es peor.
   */
  const bloqueoDelPase = motivoBloqueo(reglas, grupoFijo, tipoIdNum)

  /**
   * Los materiales del modal, agrupados por grupo.
   *
   * Es la forma de que la regla se entienda sola: viendo los encabezados queda
   * claro que los materiales vienen en bloques y que el pase se queda con uno.
   */
  const secciones = useMemo(() => {
    const porGrupo = new Map<string, IMaterial[]>()
    for (const m of matFiltrados) {
      const titulo = m.Grupo ?? 'Sin grupo'
      if (!porGrupo.has(titulo)) porGrupo.set(titulo, [])
      porGrupo.get(titulo)!.push(m)
    }
    return Array.from(porGrupo, ([title, data]) => ({ title, data }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [matFiltrados])

  const agregar = (m: IMaterial) => {
    setLineas(prev => [...prev, LINEA_VACIA(m)])
    setMatOpen(false)
  }

  /** Igual que `cambiar`, para el único campo de la línea que no es texto. */
  const cambiarParcial = (i: number, valor: boolean) =>
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, RegresoParcial: valor } : l)))

  const cambiar = (i: number, campo: keyof Linea, valor: string) => {
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))
    /* Tocar la línea le quita el rojo sin esperar los 4 segundos: se está
       corrigiendo, y seguir señalándola es ruido. Devolver `prev` cuando no
       estaba marcada evita un render por cada tecla. */
    setLineasMalas(prev => (prev.includes(i) ? prev.filter(x => x !== i) : prev))
  }

  const guardar = async () => {
    if (!tipoId) { showToast('warning', 'Falta el tipo', 'Seleccione el tipo de salida'); return }
    if (!enviadoA.trim()) { showToast('warning', 'Falta el destino', 'Indique a quién o a dónde va'); return }

    /* El calendario ya no deja elegir días pasados, pero al EDITAR un pase viejo
       la fecha puede venir de antes sin que nadie la toque. Se valida igual. */
    if (fechaSalida < fechaMinima) {
      showToast('warning', 'Fecha vencida',
        'Un pase con esa fecha ya estaría vencido y seguridad no lo dejaría salir. Elija una fecha válida.')
      return
    }

    // Nombre Y apellido: el SP lo exige igual, y un "Juan" no le sirve al
    // guardia para comparar contra el documento.
    if (!responsable.trim()) {
      showToast('warning', 'Falta el responsable', 'Indique quién va a retirar el material')
      return
    }
    if (!responsable.trim().includes(' ')) {
      showToast('warning', 'Falta el apellido', 'El responsable debe llevar nombre y apellido')
      return
    }
    if (!lineas.length) { showToast('warning', 'Sin materiales', 'Se debe agregar al menos un material'); return }

    // Cubre el caso de cambiar el tipo DESPUÉS de armar el detalle. El SP lo
    // rechaza igual; acá se dice con el nombre del grupo y del tipo.
    if (bloqueoDelPase === 'noPermitido') {
      showToast('error', 'Combinación no permitida',
        `Los materiales de "${grupoNombre}" no se pueden sacar con "${tipoNombre}".`)
      return
    }
    if (bloqueoDelPase === 'sinConfigurar') {
      showToast('warning', 'Sin firmas configuradas',
        `"${grupoNombre}" no tiene firmas definidas para "${tipoNombre}". Avise al administrador del módulo.`)
      return
    }

    /* Se revisan TODAS las líneas antes de rebotar, no se corta en la primera:
       con tres líneas a medias, avisar de a una obliga a guardar tres veces
       para enterarse de todo lo que falta. Se marcan las tres en rojo y el
       toast cuenta la primera. */
    const malas = lineas
      .map((l, i) => ({ i, problema: validarLinea(l, unidadGeneral) }))
      .filter(x => x.problema !== null)

    if (malas.length) {
      marcarLineas(malas.map(x => x.i))
      const { i, problema } = malas[0]
      showToast(
        'warning',
        `Línea ${i + 1} · ${lineas[i].Material}`,
        malas.length > 1
          ? `${problema} (y ${malas.length - 1} línea${malas.length > 2 ? 's' : ''} más con datos pendientes)`
          : problema!,
      )
      return
    }

    setGuardando(true)
    try {
      const res = await pasesService.guardar({
        // El mismo SP crea y edita: -1 crea, el Id real edita.
        Id: esEdicion ? paseId! : -1,
        TipoSalida_Id: Number(tipoId),
        EnviadoA: enviadoA.trim(),
        Responsable: responsable.trim(),
        Comentario: comentario.trim() || null,
        /* Sin el acceso no se manda nunca en true, aunque el estado hubiera
           quedado puesto: el SP lo rechazaría y el error no diría nada útil. */
        UnidadGeneral: conUnidadGeneral && unidadGeneral,
        FechaSalida: fechaSalida,
        Detalle: lineas.map(l => ({
          Material_Id: l.Material_Id,
          Descripcion: l.Descripcion.trim() || null,
          // Con unidad general van en null: el SP los normaliza igual, pero
          // mandar un 1 desde acá sería inventar una cantidad que nadie escribió.
          Cantidad: unidadGeneral ? null : Number(l.Cantidad.replace(',', '.')),
          UnidadMedida: unidadGeneral ? null : l.UnidadMedida,
          // null cuando la pregunta no se hizo. El servidor normaliza igual,
          // pero mandar false desde acá diría "se decidió que vuelve completo"
          // en un pase donde nunca se preguntó.
          RegresoParcial: preguntarParcial ? l.RegresoParcial : null,
          Marca: l.Marca.trim() || null,
          Modelo: l.Modelo.trim() || null,
          Serie: l.Serie.trim() || null,
        })),
      })

      if (res.Success) {
        showToast(
          'success',
          esEdicion ? 'Pase actualizado' : 'Pase creado',
          res.SuccessMessage || `Se generó ${res.Correlativo ?? 'el pase'}`,
        )
        navigation.goBack()
      } else {
        showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intente de nuevo')
      }
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  /**
   * Descarta el pase. No lo borra: el backend lo mueve a "Eliminado" y deja de
   * traerlo en todas las consultas. Solo se ofrece al editar, que es cuando el
   * pase sigue pendiente.
   */
  const eliminar = async () => {
    if (!esEdicion) return
    setConfirmEliminar(false)
    setGuardando(true)
    try {
      const res = await pasesService.eliminar(paseId!)
      if (res.Success) {
        showToast('success', 'Eliminado', res.SuccessMessage || 'El pase fue eliminado')
        navigation.goBack()
      } else {
        showToast('error', 'No se pudo eliminar', res.ErrorMessage || 'Intente de nuevo')
      }
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo eliminar') }
    finally { setGuardando(false) }
  }

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        {esEdicion ? (route.params?.correlativo ?? 'Editar pase') : 'Nuevo pase'}
      </Text>
    ),
    right: esEdicion ? (
      <View onPress={guardando ? undefined : () => setConfirmEliminar(true)}
        pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <Trash2 size={20} color="#ef4444" />
      </View>
    ) : undefined,
  })

  if (loading) {
    return (
      <View flex={1} backgroundColor="$background">
        <SkeletonForm />
      </View>
    )
  }

  // Si la API falló no se sabe si hay materiales: decir que no hay sería inventar.
  if (error) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type={error.type}
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      </View>
    )
  }

  /* El alcance son dos mitades —qué materiales y con qué motivos— y sin
     cualquiera de las dos no hay pase posible. Se dice CUÁL falta: sin eso los
     dos casos se veían igual y no se sabía qué pedirle al administrador. */
  if (!materiales.length || !tipos.length) {
    return (
      <View flex={1} backgroundColor="$background">
        <EmptyState
          title="Todavía no puede crear pases"
          message={`${
            !materiales.length && !tipos.length
              ? 'No tiene materiales ni tipos de salida asignados.'
              : !materiales.length
                ? 'No tiene materiales asignados.'
                : 'No tiene ningún tipo de salida asignado: no hay con qué motivo sacarlos.'
          } Solicite al administrador del módulo que le configure el alcance en la pantalla de Solicitantes.`}
          onAction={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      </View>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      {/* Las dos props que cambian todo en esta pantalla:

          keyboardShouldPersistTaps="always"  tocar fuera de un campo NO cierra
            el teclado. Con "handled" —lo habitual— cada toque en blanco lo
            cerraba, y en un formulario de varias líneas eso pasa todo el tiempo.

          keyboardDismissMode="none"  arrastrar tampoco lo cierra. Con "on-drag",
            intentar ver un campo tapado cerraba el teclado justo cuando se lo
            necesitaba, que es lo que rompía el flujo en Android.

          El teclado se cierra con el botón atrás o con la tecla del teclado, que
          es cuando el usuario de verdad terminó de escribir. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <RNScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          padding: 12,
          flexGrow: 1,
          /* El espacio del footer fijo MÁS el del teclado en Android: ahí el
             teclado se dibuja encima y sin este padding no hay a dónde
             desplazarse. */
          paddingBottom: FOOTER_H + 16 + paddingTeclado,
        }}
      >

        {/* ── Encabezado. Tipo y fecha comparten línea: en un teléfono cada uno
             solo necesita media pantalla y así el detalle sube. ── */}
        {/* gap 0 a propósito: AppInput, AppSelect y AppDatePicker ya traen su
            propio marginBottom. Con gap encima el espacio salía doble y los
            campos quedaban nadando. */}
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
          padding="$3" paddingBottom="$1.5" gap="$0" {...shadows.sm}>

          <XStack gap="$2">
            <YStack flex={1}>
              <AppSelect
                label="Tipo de salida"
                value={tipoId}
                onValueChange={(v) => setTipoId(String(v))}
                options={tipos.map(t => ({ label: t.Name, value: String(t.Id) }))}
                placeholder="Seleccione"
              />
            </YStack>
            <YStack flex={1}>
              {/* No se puede pedir un pase para ayer: el plazo se cuenta desde
                  esa fecha, así que uno con fecha pasada nace vencido y seguridad
                  lo rebota. `minDate` deja los días anteriores sin tocar en el
                  calendario, que explica la regla mejor que un error después. */}
              <AppDatePicker
                label="Fecha de salida"
                value={fechaSalida}
                minDate={fechaMinima}
                onChange={(v) => setFechaSalida(v ?? HOY())}
              />
            </YStack>
          </XStack>

          <AppInput label="Enviado a" value={enviadoA} onChangeText={setEnviadoA} onFocus={subirCampo}
            placeholder="Persona, empresa o lugar de destino" />

          {/* Quién RETIRA, que no es quién pide: seguridad compara este nombre
              contra el documento de quien se para en la puerta.

              Estos dos llevan un respiro extra —el responsable es el dato que
              se revisa en la puerta y el comentario es un área de varias
              líneas—, y como AppInput no acepta márgenes propios, el aire se
              pone con un separador. */}
          <View height={7} />
          <AppInput label="Responsable de retirar" value={responsable} onChangeText={setResponsable} onFocus={subirCampo}
            placeholder="Nombre y apellido de quien lo lleva"
            autoCapitalize="words" />

          <View height={7} />
          <AppInput label="Comentario" value={comentario} onChangeText={setComentario} onFocus={subirCampo}
            placeholder="Opcional" multiline />

          {/* Va en el encabezado y no en cada línea porque aplica al pase
              completo. Solo aparece con el acceso GeneralUnit.

              En pantalla se llama «Camión» porque ese es el caso real: lo que
              sale es un camión y contarlo por unidades no significa nada. El
              acceso y el campo del API siguen diciendo GeneralUnit —renombrarlos
              obligaría a rehacer el script y el contrato—, pero el usuario nunca
              ve ese nombre.

              Un renglón y nada más: es una opción que casi nunca se toca, así
              que no puede pesar más que los campos que sí se llenan siempre. La
              consecuencia se ve sola al marcarlo —desaparecen cantidad y
              unidad—, no hace falta un párrafo explicándola. */}
          {conUnidadGeneral ? (
            <XStack alignItems="center" gap="$2.5" paddingVertical="$1.5" marginBottom="$1.5"
              onPress={() => setUnidadGeneral(v => !v)} pressStyle={{ opacity: 0.6 }} hitSlop={6}>
              <View width={18} height={18} borderRadius="$1" borderWidth={1.5}
                borderColor={unidadGeneral ? ACCENT : '$border'}
                backgroundColor={unidadGeneral ? ACCENT : 'transparent'}
                alignItems="center" justifyContent="center">
                {unidadGeneral ? <Check size={12} color="#fff" /> : null}
              </View>
              <Text fontSize={12} fontWeight="800" color="$text">Camión</Text>
              <Text flex={1} fontSize={10} color="$textMuted">sin cantidad ni unidad</Text>
            </XStack>
          ) : null}
        </YStack>

        <View height={14} />

        {/* ── Detalle ── */}
        <XStack alignItems="center" gap="$2" paddingHorizontal="$1" paddingBottom="$2">
          <Package size={15} color={theme.primary?.val} />
          <Text flex={1} fontSize="$3" fontWeight="900" color="$text">Qué sale ({lineas.length})</Text>
          {/* Sin tipo elegido no se sabe qué materiales son válidos, así que el
              botón avisa en vez de abrir una lista que después miente. */}
          <View
            onPress={() => {
              if (!tipoIdNum) {
                showToast('warning', 'Falta el tipo de salida',
                  'Elija primero el tipo: define qué materiales pueden salir.')
                return
              }
              setMatFiltrados(materiales); setMatOpen(true)
            }}
            pressStyle={{ opacity: 0.8 }} opacity={tipoIdNum ? 1 : 0.5}
            borderWidth={1.5} borderColor={ACCENT} backgroundColor={ACCENT_BG} borderRadius="$10"
            paddingHorizontal="$3" paddingVertical={5} flexDirection="row" alignItems="center" gap="$1.5">
            <Plus size={13} color={ACCENT} />
            <Text fontSize={12} fontWeight="800" color={ACCENT}>Agregar</Text>
          </View>
        </XStack>

        {/* Cambiaron el tipo con el detalle ya armado y el pase quedó inválido. */}
        {bloqueoDelPase ? (
          <XStack alignItems="flex-start" gap="$2" marginBottom="$2.5"
            backgroundColor={bloqueoDelPase === 'noPermitido' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.18)'}
            borderWidth={1} borderColor={bloqueoDelPase === 'noPermitido' ? '#ef4444' : '#f59e0b'}
            borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={6}>
            <TriangleAlert size={12} color={bloqueoDelPase === 'noPermitido' ? '#ef4444' : '#f59e0b'} />
            <Text flex={1} fontSize={10} fontWeight="700"
              color={bloqueoDelPase === 'noPermitido' ? '#ef4444' : '#f59e0b'}>
              {bloqueoDelPase === 'noPermitido'
                ? `Los materiales de "${grupoNombre}" no se pueden sacar con "${tipoNombre}". Cambie el tipo de salida o quite las líneas.`
                : `"${grupoNombre}" no tiene firmas configuradas para "${tipoNombre}". Avise al administrador del módulo.`}
            </Text>
          </XStack>
        ) : null}

        <YStack gap="$2.5">
          {lineas.map((l, i) => {
            // Rebotó al guardar y todavía está dentro de los 4 segundos.
            const mala = lineasMalas.includes(i)
            return (
            // Mismo criterio que el encabezado: gap 0, porque cada campo ya trae
            // su marginBottom. El único que necesita aire propio es el título,
            // que no es un campo.
            //
            // Solo el BORDE cambia de color. Ni fondo teñido ni grosor: el
            // fondo ensucia la tarjeta y pasar el borde de 1 a 2 movería el
            // contenido de todas las de abajo durante esos segundos. El ícono y
            // la leyenda de adentro terminan de decirlo.
            <YStack key={`${l.Material_Id}-${i}`} borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1} borderColor={mala ? '#ef4444' : '$border'}
              padding="$3" paddingBottom="$1.5"
              gap="$0" {...shadows.sm}>

              <XStack alignItems="center" gap="$2" marginBottom="$2">
                <YStack flex={1}>
                  <XStack alignItems="center" gap="$1.5">
                    <Text fontSize={14} fontWeight="800" color="$text">{l.Material}</Text>
                    {/* El borde rojo dice CUÁL línea; esto dice QUÉ pasa, para
                        quien no relacione el color con el aviso que ya se fue. */}
                    {mala ? <TriangleAlert size={13} color="#ef4444" /> : null}
                  </XStack>
                  {mala ? (
                    <Text fontSize={10} color="#ef4444" fontWeight="700">
                      Faltan datos en esta línea
                    </Text>
                  ) : l.EsEquipo ? (
                    <Text fontSize={10} color="$textMuted">Equipo: pide marca, modelo y serie</Text>
                  ) : null}
                </YStack>
                <View onPress={() => setLineas(prev => prev.filter((_, j) => j !== i))}
                  pressStyle={{ opacity: 0.6 }} padding="$1" hitSlop={8}>
                  <Trash2 size={16} color="#ef4444" />
                </View>
              </XStack>

              {/* La descripción va primero: es lo que dice QUÉ salió. El nombre
                  del material es la categoría, no identifica el producto.

                  El margen negativo recorta el marginBottom propio de AppInput:
                  descripción y marca son los dos campos que se llenan siempre y
                  van juntos, no separados como bloques distintos. */}
              <View marginBottom={-7}>
                <AppInput label="Descripción del producto" value={l.Descripcion}
                  placeholder="Ej. Juego de llaves mixtas"
                  onChangeText={(v: string) => cambiar(i, 'Descripcion', v)} onFocus={subirCampo} />
              </View>

              {/* Cantidad y unidad son cortas: el resto de la línea es para la
                  marca. Con unidad general los dos campos desaparecen y la
                  marca se queda con la fila entera — deshabilitarlos en gris
                  invitaría a preguntarse por qué no se puede escribir ahí. */}
              <XStack gap="$2">
                {!unidadGeneral ? (
                  <YStack flex={1.1}>
                    <AppInput label="Cant." value={l.Cantidad} keyboardType="numeric"
                      onChangeText={(v: string) => cambiar(i, 'Cantidad', v)} onFocus={subirCampo} />
                  </YStack>
                ) : null}
                {!unidadGeneral ? (
                  <YStack flex={1.5}>
                    <AppSelect
                      label="Unidad"
                      value={l.UnidadMedida}
                      onValueChange={(v) => cambiar(i, 'UnidadMedida', String(v))}
                      options={UNIDADES.map(u => ({ label: u, value: u }))}
                    />
                  </YStack>
                ) : null}
                <YStack flex={2.4}>
                  <AppInput label="Marca" value={l.Marca} onChangeText={(v: string) => cambiar(i, 'Marca', v)} onFocus={subirCampo} />
                </YStack>
              </XStack>

              {l.EsEquipo ? (
                <XStack gap="$2">
                  <YStack flex={1}>
                    <AppInput label="Modelo" value={l.Modelo} onChangeText={(v: string) => cambiar(i, 'Modelo', v)} onFocus={subirCampo} />
                  </YStack>
                  <YStack flex={1}>
                    <AppInput label="Serie" value={l.Serie} onChangeText={(v: string) => cambiar(i, 'Serie', v)} onFocus={subirCampo} />
                  </YStack>
                </XStack>
              ) : null}

              {/* Por línea y no por pase: en un pase con un torno y diez
                  brocas, el torno vuelve entero o no vuelve, y las brocas
                  pueden ir volviendo de a poco.

                  Aparece solo si el tipo exige retorno y el solicitante tiene
                  el acceso. Sin las dos cosas la pregunta no existe. */}
              {preguntarParcial ? (
                <XStack alignItems="center" gap="$2.5" paddingVertical="$1.5" marginBottom="$1"
                  onPress={() => cambiarParcial(i, !l.RegresoParcial)}
                  pressStyle={{ opacity: 0.6 }} hitSlop={6}>
                  <View width={18} height={18} borderRadius="$1" borderWidth={1.5}
                    borderColor={l.RegresoParcial ? ACCENT : '$border'}
                    backgroundColor={l.RegresoParcial ? ACCENT : 'transparent'}
                    alignItems="center" justifyContent="center">
                    {l.RegresoParcial ? <Check size={12} color="#fff" /> : null}
                  </View>
                  <Text fontSize={12} fontWeight="800" color="$text">Se permite regreso parcial</Text>
                </XStack>
              ) : null}
            </YStack>
            )
          })}

          {lineas.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$8" gap="$2">
              <Package size={26} color={theme.textMuted?.val} />
              <Text fontSize="$2" color="$textMuted">No se han agregado materiales.</Text>
            </YStack>
          ) : null}
        </YStack>

      </RNScrollView>
      </KeyboardAvoidingView>

      {/* Footer fijo al fondo. No se mueve con el teclado: el formulario ya deja
          espacio y subirlo tapaba el campo que se está escribiendo. */}
      <YStack position="absolute" left={0} right={0} bottom={0}
        backgroundColor="$background" borderTopWidth={1} borderTopColor="$border"
        paddingHorizontal="$3" paddingTop="$2" paddingBottom="$3" gap="$2">

        <XStack alignItems="center" gap="$1.5" backgroundColor="rgba(245, 158, 11, 0.18)"
          borderWidth={1} borderColor="#f59e0b" borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={5}>
          <TriangleAlert size={11} color="#f59e0b" />
          <Text flex={1} fontSize={10} color="#f59e0b" fontWeight="700">
            El pase se envía a autorización. Si usted mismo puede dar alguna de las firmas requeridas, se aplica sola al guardar.
          </Text>
        </XStack>

        <XStack gap="$2.5">
          <View flex={1} onPress={guardando ? undefined : () => navigation.goBack()} pressStyle={{ opacity: 0.85 }}
            borderWidth={1.5} borderColor="$border" borderRadius="$4" height={48} alignItems="center" justifyContent="center">
            <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
          </View>
          <View flex={1} onPress={guardando ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
            opacity={guardando ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={48}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            {guardando ? <Spinner color="#fff" /> : null}
            <Text color="#fff" fontWeight="800" fontSize="$3">Guardar</Text>
          </View>
        </XStack>
      </YStack>

      <ConfirmDialog
        open={confirmEliminar}
        onOpenChange={(o: boolean) => { if (!o) setConfirmEliminar(false) }}
        title="Eliminar pase"
        message={`¿Eliminar ${route.params?.correlativo ?? 'este pase'}? Dejará de aparecer en las pantallas y no se puede deshacer.`}
        confirmLabel="Eliminar"
        confirmColor="#ef4444"
        onConfirm={eliminar}
      />

      {/* ── Modal: elegir material ── */}
      <Modal visible={matOpen} transparent animationType="fade" onRequestClose={() => setMatOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} maxHeight="85%" backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">Agregar material</Text>

            {/* La regla se explica SIEMPRE, no solo cuando ya recortó la lista:
                si se avisa recién cuando faltan materiales, el usuario ya eligió
                mal y siente que se los quitaron. */}
            <XStack alignItems="flex-start" gap="$2" backgroundColor="rgba(245, 158, 11, 0.18)"
              borderWidth={1} borderColor="#f59e0b" borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={6}>
              <TriangleAlert size={12} color="#f59e0b" />
              <Text flex={1} fontSize={10} color="#f59e0b" fontWeight="700">
                {grupoNombre
                  ? `Este pase es del grupo "${grupoNombre}". Los materiales de otros grupos aparecen bloqueados: cada grupo tiene su propia cadena de firmas.`
                  : `Salida de tipo "${tipoNombre}". Lo que no se puede sacar así aparece bloqueado, y al agregar el primero queda fijado su grupo.`}
              </Text>
            </XStack>

            <SearchInput
              data={materiales}
              searchKeys={['Name']}
              onResults={setMatFiltrados}
              placeholder="Buscar..."
            />

            <SectionList
              sections={secciones}
              keyExtractor={(m) => String(m.Id)}
              style={{ maxHeight: 360 }}
              stickySectionHeadersEnabled={false}
              ItemSeparatorComponent={() => <View height={6} />}
              keyboardShouldPersistTaps="handled"
              renderSectionHeader={({ section }) => (
                <XStack alignItems="center" gap="$2" paddingTop="$2.5" paddingBottom="$1.5">
                  <Boxes size={12} color={theme.textMuted?.val} />
                  <Text fontSize={11} fontWeight="900" color="$textMuted">
                    {section.title.toUpperCase()}
                  </Text>
                  <View flex={1} height={1} backgroundColor="$border" />
                  <Text fontSize={10} color="$textMuted">{section.data.length}</Text>
                </XStack>
              )}
              renderItem={({ item: m }) => {
                const motivo = bloqueoDe(m)
                const off = motivo != null
                return (
                  <XStack alignItems="center" gap="$3" paddingVertical="$2.5" paddingHorizontal="$3"
                    borderRadius="$3" borderWidth={1} borderColor="$border"
                    opacity={off ? 0.45 : 1}
                    backgroundColor={off ? '$backgroundHover' : 'transparent'}
                    onPress={off ? undefined : () => agregar(m)}
                    pressStyle={off ? undefined : { opacity: 0.7 }}>
                    <YStack flex={1}>
                      <Text fontSize={13} fontWeight="700" color="$text">{m.Name}</Text>
                      {motivo ? (
                        <Text fontSize={10} color={motivo === 'noPermitido' ? '#ef4444' : '$textMuted'}>
                          {TEXTO_MOTIVO[motivo]}
                        </Text>
                      ) : m.EsEquipo ? (
                        <Text fontSize={10} color="$textMuted">Equipo</Text>
                      ) : null}
                    </YStack>
                    {off ? (
                      <View borderWidth={1} borderColor="$border" borderRadius="$10"
                        width={24} height={24} alignItems="center" justifyContent="center">
                        <LockIcon size={12} color={theme.textMuted?.val} />
                      </View>
                    ) : (
                      <View backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                        borderRadius="$10" width={24} height={24} alignItems="center" justifyContent="center">
                        <Plus size={13} color={ACCENT} />
                      </View>
                    )}
                  </XStack>
                )
              }}
              ListEmptyComponent={<Text fontSize={12} color="$textMuted" paddingVertical="$4">Sin resultados.</Text>}
            />

            <View onPress={() => setMatOpen(false)} pressStyle={{ opacity: 0.85 }}
              borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
              <Text color="$text" fontWeight="800" fontSize="$3">Cerrar</Text>
            </View>
          </YStack>
        </View>
      </Modal>
    </View>
  )
}
