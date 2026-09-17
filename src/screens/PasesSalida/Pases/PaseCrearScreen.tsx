import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, SectionList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
// `Lock` se renombra: choca con el tipo global Lock del DOM y TS resuelve ese.
import { ArrowLeft, Plus, Trash2, Package, TriangleAlert, Boxes, Lock as LockIcon } from 'lucide-react-native'
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
import { ACCENT, ACCENT_BG, UNIDADES } from '../pasesSalida.helpers'
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
})

/** Alto del footer fijo: el scroll reserva ese espacio para no quedar tapado. */
const FOOTER_H = 108

/** Devuelve el problema de la línea, o null si está bien. */
const validarLinea = (l: Linea): string | null => {
  if (!l.Descripcion.trim()) return 'Falta la descripción del producto'
  const cant = Number(l.Cantidad.replace(',', '.'))
  if (!l.Cantidad.trim() || isNaN(cant) || cant <= 0) return 'La cantidad tiene que ser mayor que cero'
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

  // Con id se está EDITANDO un pase pendiente; sin id se está creando.
  const paseId: number | undefined = route.params?.id
  const esEdicion = typeof paseId === 'number' && paseId > 0

  const [tipos, setTipos] = useState<ITipoSalida[]>([])
  // Qué grupo puede salir con qué tipo. Tabla chica: se trae entera y se
  // resuelve en memoria cada vez que cambia el tipo o el grupo del pase.
  const [reglas, setReglas] = useState<IReglaResumen[]>([])
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
  const [comentario, setComentario] = useState('')

  // Detalle
  const [lineas, setLineas] = useState<Linea[]>([])
  const [matOpen, setMatOpen] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [rTipos, rMat, rReglas] = await Promise.all([
        pasesSalidaService.getTiposSalida(true),
        pasesService.getMisMateriales(),
        pasesService.getReglas(),
      ])
      setTipos(rTipos.Data ?? [])
      setReglas(rReglas.Data ?? [])
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
        setComentario(p.Comentario ?? '')
      }
      setLineas((rDet.Data ?? []).map(d => ({
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

  const cambiar = (i: number, campo: keyof Linea, valor: string) =>
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  const guardar = async () => {
    if (!tipoId) { showToast('warning', 'Falta el tipo', 'Seleccione el tipo de salida'); return }
    if (!enviadoA.trim()) { showToast('warning', 'Falta el destino', 'Indique a quién o a dónde va'); return }
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

    for (let i = 0; i < lineas.length; i++) {
      const problema = validarLinea(lineas[i])
      if (problema) { showToast('warning', `Línea ${i + 1} · ${lineas[i].Material}`, problema); return }
    }

    setGuardando(true)
    try {
      const res = await pasesService.guardar({
        // El mismo SP crea y edita: -1 crea, el Id real edita.
        Id: esEdicion ? paseId! : -1,
        TipoSalida_Id: Number(tipoId),
        EnviadoA: enviadoA.trim(),
        Comentario: comentario.trim() || null,
        FechaSalida: fechaSalida,
        Detalle: lineas.map(l => ({
          Material_Id: l.Material_Id,
          Descripcion: l.Descripcion.trim() || null,
          Cantidad: Number(l.Cantidad.replace(',', '.')),
          UnidadMedida: l.UnidadMedida,
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

  // Sin materiales en el alcance no hay nada que pedir: se dice y se sale.
  if (!materiales.length) {
    return (
      <View flex={1} backgroundColor="$background">
        <EmptyState
          title="Sin materiales habilitados"
          message="Solicite al administrador del módulo que le asigne materiales en la pantalla de Solicitantes."
          onAction={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      </View>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: FOOTER_H + 16 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Encabezado. Tipo y fecha comparten línea: en un teléfono cada uno
             solo necesita media pantalla y así el detalle sube. ── */}
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
          padding="$3.5" gap="$2" {...shadows.sm}>

          <XStack gap="$2.5">
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
              <AppDatePicker
                label="Fecha de salida"
                value={fechaSalida}
                onChange={(v) => setFechaSalida(v ?? dayjs().format('YYYY-MM-DD'))}
              />
            </YStack>
          </XStack>

          <AppInput label="Enviado a" value={enviadoA} onChangeText={setEnviadoA}
            placeholder="Persona, empresa o lugar de destino" />

          <AppInput label="Comentario" value={comentario} onChangeText={setComentario}
            placeholder="Opcional" multiline />
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
          {lineas.map((l, i) => (
            <YStack key={`${l.Material_Id}-${i}`} backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="$border" padding="$4" gap="$2.5" {...shadows.sm}>

              <XStack alignItems="center" gap="$2">
                <YStack flex={1}>
                  <Text fontSize={14} fontWeight="800" color="$text">{l.Material}</Text>
                  {l.EsEquipo ? (
                    <Text fontSize={10} color="$textMuted">Equipo: pide marca, modelo y serie</Text>
                  ) : null}
                </YStack>
                <View onPress={() => setLineas(prev => prev.filter((_, j) => j !== i))}
                  pressStyle={{ opacity: 0.6 }} padding="$1" hitSlop={8}>
                  <Trash2 size={16} color="#ef4444" />
                </View>
              </XStack>

              {/* La descripción va primero: es lo que dice QUÉ salió. El nombre
                  del material es la categoría, no identifica el producto. */}
              <AppInput label="Descripción del producto" value={l.Descripcion}
                placeholder="Ej. Juego de llaves mixtas"
                onChangeText={(v: string) => cambiar(i, 'Descripcion', v)} />

              {/* Cantidad y unidad son cortas: el resto de la línea es para la marca. */}
              <XStack gap="$2">
                <YStack flex={1.1}>
                  <AppInput label="Cant." value={l.Cantidad} keyboardType="numeric"
                    onChangeText={(v: string) => cambiar(i, 'Cantidad', v)} />
                </YStack>
                <YStack flex={1.5}>
                  <AppSelect
                    label="Unidad"
                    value={l.UnidadMedida}
                    onValueChange={(v) => cambiar(i, 'UnidadMedida', String(v))}
                    options={UNIDADES.map(u => ({ label: u, value: u }))}
                  />
                </YStack>
                <YStack flex={2.4}>
                  <AppInput label="Marca" value={l.Marca} onChangeText={(v: string) => cambiar(i, 'Marca', v)} />
                </YStack>
              </XStack>

              {l.EsEquipo ? (
                <XStack gap="$2.5">
                  <YStack flex={1}>
                    <AppInput label="Modelo" value={l.Modelo} onChangeText={(v: string) => cambiar(i, 'Modelo', v)} />
                  </YStack>
                  <YStack flex={1}>
                    <AppInput label="Serie" value={l.Serie} onChangeText={(v: string) => cambiar(i, 'Serie', v)} />
                  </YStack>
                </XStack>
              ) : null}
            </YStack>
          ))}

          {lineas.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$8" gap="$2">
              <Package size={26} color={theme.textMuted?.val} />
              <Text fontSize="$2" color="$textMuted">No se han agregado materiales.</Text>
            </YStack>
          ) : null}
        </YStack>

      </ScrollView>

      {/* Footer fijo al fondo. No se mueve con el teclado: el ScrollView ya deja
          espacio y subirlo tapaba el campo que se está escribiendo. */}
      <YStack position="absolute" left={0} right={0} bottom={0}
        backgroundColor="$background" borderTopWidth={1} borderTopColor="$border"
        paddingHorizontal="$3" paddingTop="$2" paddingBottom="$3" gap="$2">

        <XStack alignItems="center" gap="$1.5" backgroundColor="rgba(245, 158, 11, 0.18)"
          borderWidth={1} borderColor="#f59e0b" borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={5}>
          <TriangleAlert size={11} color="#f59e0b" />
          <Text flex={1} fontSize={10} color="#f59e0b" fontWeight="700">
            El pase queda pendiente hasta reunir todas las firmas requeridas.
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
