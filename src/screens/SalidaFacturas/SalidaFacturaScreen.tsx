import React, { useCallback, useMemo, useState } from 'react'
import { Alert, BackHandler } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useDrawerStatus } from '@react-navigation/drawer'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ArrowLeft, ScanBarcode, RotateCw, Search, CheckCircle2, ListChecks, Undo2, Trash2, RotateCcw } from 'lucide-react-native'

import KeyboardAwareForm from '../../components/commons/KeyboardAwareForm'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { salidaFacturasService } from '../../api/modules/salidaFacturas/salidaFacturas.service'
import { ISalidaCD, ISalidaCDLinea } from '../../api/modules/salidaFacturas/salidaFacturas.types'
import {
  ACCENT, Aviso, GrupoArticulo, GrupoCard, ScannerModal, agruparItems,
  fmtCantidad, fmtFecha, fmtFechaHora, piezasDe,
} from './components'

/**
 * Control de Salida del CD (pantalla del guardia). UNA sola pantalla para las
 * dos cosas que salen por esa puerta: FACTURAS y DIARIOS de inventario de AX.
 *
 * El guardia escanea el código de barras de la factura —o escribe el número del
 * diario, que no tiene código de barras—, va marcando lo que cuenta y confirma
 * la salida. Las líneas se agrupan por artículo + color con las tallas como
 * columnas: es como está armado el bulto que tiene enfrente, no como está
 * armado el papel.
 *
 * ⚠ QUIÉN DECIDE SI ES FACTURA O DIARIO: el SERVIDOR. Se le manda el código tal
 * cual (la regla es «empieza con DI = diario») y la respuesta trae `Tipo`. Si la
 * regla viviera acá, cambiarla obligaría a esperar una release de tienda.
 *
 * Lo único que cambia entre los dos es la CABECERA. La matriz, el avance,
 * «Validar todo» y «Confirmar salida» son idénticos porque el trabajo lo es.
 *
 * Reglas que NO viven acá (las hace valer el servidor, que es lo que importa):
 * algo sale una sola vez, no sale con artículos sin revisar, no se procesa si es
 * anterior al corte, y un diario tiene que estar posteado en AX. Acá solo se
 * refleja.
 */
export default function SalidaFacturaScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()
  const drawerAbierto = useDrawerStatus() === 'open'

  const [scannerOpen, setScannerOpen] = useState(false)
  const [manual, setManual] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `doc` es lo que se está revisando: una factura O un diario. Su `Tipo` lo
  // dijo el servidor.
  const [doc, setDoc] = useState<ISalidaCD | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [marcandoTodo, setMarcandoTodo] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [salida, setSalida] = useState<{ codigo: string; tipo: string; fecha: string | null } | null>(null)

  const esDiario = doc?.Tipo === 'DIARIO'
  // El sustantivo con el que se le habla al guardia, para no repetir el mismo
  // `if` en cada aviso.
  const nombre = esDiario ? 'diario' : 'factura'
  const Nombre = esDiario ? 'Diario' : 'Factura'

  // ── Búsqueda ──────────────────────────────────────────────────────────────

  const buscar = useCallback(async (codigo: string) => {
    const cod = (codigo || '').trim()
    if (!cod) return
    setBuscando(true)
    setError(null)
    setSalida(null)
    try {
      const res = await salidaFacturasService.escanearCD(cod)
      if (res.Success && res.Data) {
        setDoc(res.Data)
        setManual('')
      } else {
        setDoc(null)
        setError(res.ErrorMessage || 'No se pudo cargar el documento')
      }
    } catch (e: any) {
      setDoc(null)
      setError(e?.message || 'No se pudo consultar. Intenta de nuevo.')
    } finally {
      setBuscando(false)
    }
  }, [])

  const onScan = (code: string) => {
    setScannerOpen(false)
    buscar(code)
  }

  const limpiar = useCallback(() => {
    setDoc(null)
    setError(null)
    setSalida(null)
    setManual('')
  }, [])

  // ── Volver ────────────────────────────────────────────────────────────────
  // La pantalla tiene dos momentos: el recuadro para escanear, y el documento (o
  // el error / el acuse de salida) que vino de ese escaneo.
  const hayResultado = !!doc || !!error || !!salida

  // Regresar al escaneo solo se podía desde el botón del fondo, y con una
  // factura de varios artículos eso son varias pantallas de scroll. La flecha
  // del header está siempre a la vista.
  //
  // «Atrás» son dos pasos, iguales para la flecha y para el botón del
  // teléfono: primero limpia lo que hay en pantalla (y queda listo para la
  // siguiente factura), y recién entonces sale. El drawer no apila pantallas:
  // al salir regresa a Inicio, que es su primera ruta.
  //
  // Sin nada que limpiar, la flecha le cede el lugar al ☰: así se entra al
  // Historial sin pasar por Inicio.
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Salida del CD</Text>,
    left: hayResultado
      ? (
        <View onPress={limpiar} pressStyle={{ opacity: 0.6 }} hitSlop={12} paddingVertical="$1" paddingRight="$2">
          <ArrowLeft size={24} color={theme.text?.val as string} />
        </View>
      )
      : undefined,
  }, [hayResultado])

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        // Con el menú abierto, «atrás» es cerrar el menú, y eso lo hace la
        // navegación. Este handler corre ANTES que el suyo (Android llama al
        // último registrado primero), así que si no se aparta, atrás borraría la
        // factura y dejaría el menú abierto.
        if (drawerAbierto) return false
        // El escáner es un Modal y Android lo cierra por su cuenta; si de todos
        // modos llegara acá, cerrarlo es lo que corresponde antes de salir.
        if (scannerOpen) { setScannerOpen(false); return true }
        if (hayResultado) { limpiar(); return true }
        return false // sin nada que limpiar: que el drawer haga lo suyo
      })
      return () => sub.remove()
    }, [drawerAbierto, scannerOpen, hayResultado, limpiar]),
  )

  // ── Marcar artículos ──────────────────────────────────────────────────────

  // Cambio local inmediato: el guardia toca mientras cuenta y no puede esperar
  // el viaje al servidor por cada talla. Si el servidor rechaza, se revierte y
  // se avisa; y de todos modos la salida la valida el servidor al confirmar,
  // así que un check perdido no puede dejar salir una factura sin revisar.
  const aplicarLocal = (lineNums: number[], valor: boolean) =>
    setDoc(d => d
      ? { ...d, Items: d.Items.map(i => (lineNums.includes(i.LineNum) ? { ...i, Revisado: valor } : i)) }
      : d)

  const marcar = async (lineNums: number[], valor: boolean) => {
    if (!doc?.Codigo || !lineNums.length) return
    const { Tipo, Codigo } = doc
    aplicarLocal(lineNums, valor)
    try {
      const resultados = await Promise.all(
        lineNums.map(n => salidaFacturasService.marcarLineaCD(Tipo, Codigo, n, valor)),
      )
      const fallo = resultados.find(r => !r.Success)
      if (fallo) throw new Error(fallo.ErrorMessage || 'No se pudo marcar el artículo')
    } catch (e: any) {
      aplicarLocal(lineNums, !valor)
      const msg = e?.message || 'No se pudo marcar el artículo'
      showToast('error', 'No se guardó', msg)
      // Si ya salió (otro guardia lo cerró) o alguien lo descartó, la pantalla
      // está vieja: se recarga para que muestre el bloqueo en vez de dejar
      // seguir marcando.
      if (/ya salió|descartad/i.test(msg)) buscar(Codigo)
    }
  }

  const toggleLinea = (linea: ISalidaCDLinea) => marcar([linea.LineNum], !linea.Revisado)

  const toggleGrupo = (g: GrupoArticulo) => {
    const todos = g.lineas.every(l => l.Revisado)
    marcar(g.lineas.map(l => l.LineNum), !todos)
  }

  // ── Validar toda la factura ───────────────────────────────────────────────
  // Hay facturas del CD de cientos de artículos (la más grande medida: 371
  // líneas) y marcarlas grupo por grupo no es trabajo de puerta.
  //
  // Va en UNA llamada y NO en un bucle de marcarLinea: 371 líneas serían 371
  // peticiones desde el teléfono. El servidor lo hace en un solo UPDATE y no
  // pisa la hora ni el nombre de lo que el guardia ya había contado.
  //
  // ⚠ Es un candado menos: la factura puede salir sin que nadie haya contado.
  // Por eso pregunta antes, dice cuántos artículos son, y queda a nombre de
  // quien apretó el botón.
  const marcarTodo = async (valor: boolean) => {
    if (!doc?.Codigo) return
    const { Tipo, Codigo } = doc
    setMarcandoTodo(true)
    try {
      const res = await salidaFacturasService.marcarTodasCD(Tipo, Codigo, valor)
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudo validar')
      // Se pone el estado local en lo pedido en vez de recargar todo: en un
      // documento de 371 líneas ese viaje de vuelta se siente.
      setDoc(d => (d ? { ...d, Items: d.Items.map(i => ({ ...i, Revisado: valor })) } : d))
      const n = res.Data?.LineasAfectadas ?? 0
      showToast(
        'success',
        valor ? `${Nombre} validado${esDiario ? '' : 'a'}` : 'Artículos desmarcados',
        `${fmtCantidad(n)} ${n === 1 ? 'artículo' : 'artículos'}`,
      )
    } catch (e: any) {
      showToast('error', 'No se guardó', e?.message || 'No se pudo validar')
      // Si otro puesto lo cerró mientras tanto, esta pantalla está vieja.
      buscar(Codigo)
    } finally {
      setMarcandoTodo(false)
    }
  }

  // ── Descartar / reabrir ───────────────────────────────────────────────────
  // Para lo que se abrió por error: el guardia disparó (o escribió) el código
  // equivocado y esa fila quedaría en revisión para siempre, ensuciando el
  // listado de pendientes. NO borra: queda descartada con motivo, y se puede
  // reabrir — un descarte terminal dejaría la mercadería trabada, que es el
  // mismo problema que el descarte viene a resolver.
  const descartar = async (motivo: string) => {
    if (!doc?.Codigo) return
    const { Tipo, Codigo } = doc
    setDescartando(true)
    try {
      const res = await salidaFacturasService.descartar(Tipo, Codigo, motivo)
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudo descartar')
      showToast('success', 'Revisión descartada', `${Nombre} ${Codigo}`)
      buscar(Codigo)
    } catch (e: any) {
      showToast('error', 'No se descartó', e?.message || 'Intenta de nuevo')
    } finally {
      setDescartando(false)
    }
  }

  // El motivo es OBLIGATORIO (lo exige el servidor). En el teléfono se pide con
  // Alert.prompt en iOS; en Android no existe, así que se ofrecen motivos
  // fijos —que además hacen el historial más fácil de leer que texto libre—.
  const pedirDescartar = () => {
    const opciones = ['Código equivocado', 'Se abrió por error', 'No corresponde a esta salida']
    Alert.alert(
      `Descartar la revisión de ${doc?.Codigo ?? ''}`,
      'Es para lo que se abrió por error: se saca de pendientes sin borrar el registro. '
      + 'Se puede volver a abrir y lo que ya se contó se conserva.\n\n¿Por qué se descarta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        ...opciones.map(m => ({ text: m, onPress: () => descartar(m) })),
      ],
    )
  }

  const reabrir = async () => {
    if (!doc?.Codigo) return
    const { Tipo, Codigo } = doc
    setDescartando(true)
    try {
      const res = await salidaFacturasService.reabrir(Tipo, Codigo)
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudo reabrir')
      showToast('success', 'De vuelta en revisión', 'Lo que ya estaba contado se conservó.')
      buscar(Codigo)
    } catch (e: any) {
      showToast('error', 'No se reabrió', e?.message || 'Intenta de nuevo')
    } finally {
      setDescartando(false)
    }
  }

  const pedirValidarTodo = () => {
    const faltan = avance.total - avance.revisados
    const piezas = avance.piezas - avance.piezasRevisadas
    Alert.alert(
      `Validar todo el ${nombre}`,
      `Se van a marcar como revisados los ${faltan} ${faltan === 1 ? 'artículo' : 'artículos'} que faltan `
      + `(${fmtCantidad(piezas)} piezas), sin contarlos uno por uno.\n\n`
      + 'Queda registrado a tu nombre con la hora de ahora. Lo que ya contaste conserva su propia hora.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: `Validar los ${faltan}`, onPress: () => marcarTodo(true) },
      ],
    )
  }

  const pedirDesmarcarTodo = () => {
    Alert.alert(
      'Desmarcar todo',
      `Se van a desmarcar los ${avance.revisados} artículos ya revisados de ${doc?.Codigo}.\n\n`
      + 'Habrá que volver a marcarlos para poder confirmar la salida.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desmarcar todo', style: 'destructive', onPress: () => marcarTodo(false) },
      ],
    )
  }

  // ── Confirmar salida ──────────────────────────────────────────────────────

  const confirmar = async () => {
    if (!doc?.Codigo) return
    const { Tipo, Codigo } = doc
    setConfirmando(true)
    try {
      const res = await salidaFacturasService.completarCD(Tipo, Codigo)
      if (res.Success) {
        setSalida({ codigo: Codigo, tipo: Nombre, fecha: res.Data?.FechaSalida ?? null })
        setDoc(null)
      } else {
        showToast('error', 'No se pudo confirmar', res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo confirmar la salida')
    } finally {
      setConfirmando(false)
    }
  }

  // ── Derivados ─────────────────────────────────────────────────────────────

  const avance = useMemo(() => {
    const items = doc?.Items ?? []
    const total = items.length
    const revisados = items.filter(i => i.Revisado).length
    const piezas = piezasDe(items)
    const piezasRevisadas = piezasDe(items.filter(i => i.Revisado))
    return {
      total, revisados, piezas, piezasRevisadas,
      pct: total ? Math.round((revisados / total) * 100) : 0,
      completo: total > 0 && revisados === total,
    }
  }, [doc])

  const grupos = useMemo(() => agruparItems(doc?.Items ?? []), [doc])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View flex={1} backgroundColor="$background">
      <KeyboardAwareForm contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 1000, alignSelf: 'center' }}>
        {/* Escanear / escribir */}
        {!doc && (
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
            padding="$4" gap="$3" {...shadows.sm}>
            <Text fontSize="$5" fontWeight="800" color="$text">Escanear o escribir</Text>

            <View onPress={() => setScannerOpen(true)} pressStyle={{ opacity: 0.85 }}
              backgroundColor={ACCENT} borderRadius="$4" height={54} flexDirection="row"
              alignItems="center" justifyContent="center" gap="$2">
              <ScanBarcode size={22} color="#fff" />
              <Text color="#fff" fontWeight="800" fontSize="$4">Escanear código de barra</Text>
            </View>

            <XStack alignItems="center" gap="$2">
              <View flex={1} height={1} backgroundColor="$border" />
              <Text fontSize="$2" color="$textMuted">o escribe el número</Text>
              <View flex={1} height={1} backgroundColor="$border" />
            </XStack>

            <AppInput
              label="Número de factura o de diario"
              placeholder="Ej. 336482 o DI01147654"
              value={manual}
              onChangeText={setManual}
              /* Mayúsculas automáticas: los diarios son «DI…» y así el guardia no
                 tiene que buscar la tecla de shift. El servidor igual normaliza,
                 pero se ve mejor mientras se escribe. */
              autoCapitalize="characters"
              autoCorrect={false}
              /* ⚠ Acá NO va teclado numérico. Antes era phone-pad porque solo
                 entraban facturas, pero el número de diario lleva letras y con
                 el teclado numérico no se puede escribir. Y NUNCA
                 keyboardType="numeric": AppInput lo interpreta como cantidad y le
                 mete separador de miles, así que 336482 se vería "336,482". */
              keyboardType="default"
              returnKeyType="search"
              onSubmitEditing={() => buscar(manual)}
            />
            <View onPress={() => buscar(manual)} pressStyle={{ opacity: 0.85 }}
              opacity={manual.trim() ? 1 : 0.4}
              borderWidth={1} borderColor={ACCENT} borderRadius="$4" height={46}
              flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
              <Search size={18} color={ACCENT} />
              <Text color={ACCENT} fontWeight="800" fontSize="$3">Buscar</Text>
            </View>
          </YStack>
        )}

        {/* Buscando: la primera lectura pega contra AX y puede tardar */}
        {buscando && (
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
            padding="$5" marginTop="$3" alignItems="center" gap="$2" {...shadows.sm}>
            <Spinner size="large" color={ACCENT} />
            <Text color="$text" fontWeight="700">Buscando…</Text>
            <Text color="$textMuted" fontSize="$2" textAlign="center">
              La primera vez puede tardar unos segundos
            </Text>
          </YStack>
        )}

        {/* Error de búsqueda */}
        {!!error && !buscando && (
          <YStack marginTop="$3">
            <Aviso tipo="error">
              <Text fontSize="$3" fontWeight="700" color="$text">{error}</Text>
              <Text fontSize="$2" color="$textMuted">
                Verifica el número o vuelve a escanear el código de barra. Los diarios empiezan con DI.
              </Text>
            </Aviso>
          </YStack>
        )}

        {/* Salida confirmada */}
        {!!salida && !buscando && (
          <YStack marginTop="$3" gap="$3">
            <Aviso tipo="exito">
              <XStack alignItems="center" gap="$2">
                <CheckCircle2 size={20} color="#16a34a" />
                <Text fontSize="$4" fontWeight="800" color="$text">Salida confirmada</Text>
              </XStack>
              <Text fontSize="$3" color="$text">
                {salida.tipo} <Text fontWeight="800">{salida.codigo}</Text>
                {salida.fecha ? ` · ${fmtFechaHora(salida.fecha)}` : ''}
              </Text>
            </Aviso>
          </YStack>
        )}

        {/* Bloqueado. Los TRES motivos son conversaciones distintas con el
            guardia: ya salió (hay que decirle cuándo y con quién), es de antes de
            que existiera el control (no hay nada que hacer acá), o alguien lo
            descartó — y eso SÍ se puede deshacer, así que se ofrece. */}
        {doc?.Bloqueada && (
          <YStack gap="$3">
            {doc.MotivoBloqueo === 'ANTERIOR_AL_CORTE' ? (
              <Aviso tipo="aviso">
                <Text fontSize="$4" fontWeight="800" color="$text">{Nombre} anterior al control</Text>
                <Text fontSize="$3" color="$text">
                  {Nombre} <Text fontWeight="800">{doc.Codigo}</Text>
                  {esDiario
                    ? (doc.FechaRegistro ? ` · ${fmtFecha(doc.FechaRegistro)}` : '')
                    : (doc.FechaFactura ? ` · ${fmtFecha(doc.FechaFactura)}` : '')}
                </Text>
                {/* El texto lo arma el servidor: así dice la fecha de corte vigente
                    aunque la muevan sin recompilar la app. */}
                <Text fontSize="$2" color="$textMuted">
                  {doc.MensajeBloqueo ||
                    `Este ${nombre} es anterior al inicio del control de salida y no se puede procesar aquí.`}
                </Text>
              </Aviso>
            ) : doc.MotivoBloqueo === 'DESCARTADA' ? (
              <Aviso tipo="aviso">
                <Text fontSize="$4" fontWeight="800" color="$text">Esta revisión se descartó</Text>
                <Text fontSize="$3" color="$text">
                  {Nombre} <Text fontWeight="800">{doc.Codigo}</Text>
                  {doc.FechaDescarte ? ` · ${fmtFechaHora(doc.FechaDescarte)}` : ''}
                </Text>
                {!!doc.MotivoDescarte && (
                  <Text fontSize="$2" color="$textMuted">Motivo: {doc.MotivoDescarte}</Text>
                )}
                {!!doc.GuardiaDescarte && (
                  <Text fontSize="$2" color="$textMuted">La descartó: {doc.GuardiaDescarte}</Text>
                )}
                <Text fontSize="$2" color="$textMuted">
                  Si fue un error, se puede volver a abrir sin perder lo contado.
                </Text>
                <View onPress={descartando ? undefined : reabrir} pressStyle={{ opacity: 0.85 }}
                  opacity={descartando ? 0.5 : 1} marginTop="$2"
                  borderWidth={1} borderColor={ACCENT} borderRadius="$4" height={46}
                  flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
                  {descartando ? <Spinner color={ACCENT} /> : <RotateCcw size={18} color={ACCENT} />}
                  <Text color={ACCENT} fontWeight="800" fontSize="$3">Volver a abrir</Text>
                </View>
              </Aviso>
            ) : (
              <Aviso tipo="error">
                <Text fontSize="$4" fontWeight="800" color="$text">Este {nombre} ya salió del CD</Text>
                <Text fontSize="$3" color="$text">
                  {Nombre} <Text fontWeight="800">{doc.Codigo}</Text>
                  {doc.FechaSalida ? ` · ${fmtFechaHora(doc.FechaSalida)}` : ''}
                </Text>
                {!!doc.GuardiaSalida && (
                  <Text fontSize="$2" color="$textMuted">Guardia: {doc.GuardiaSalida}</Text>
                )}
                <Text fontSize="$2" color="$textMuted">No se puede volver a procesar.</Text>
              </Aviso>
            )}
            <BotonOtra onPress={limpiar} />
          </YStack>
        )}

        {/* En revisión */}
        {!!doc && !doc.Bloqueada && (
          <YStack gap="$3">
            {/* Cabecera */}
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
              padding="$4" gap="$2" {...shadows.sm}>
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <YStack flex={1}>
                  <Text fontSize="$6" fontWeight="900" color="$text" numberOfLines={1}>
                    {doc.Codigo}
                  </Text>
                  <Text fontSize="$1" fontWeight="800" color="$textMuted">
                    {esDiario ? 'DIARIO DE INVENTARIO' : 'FACTURA'}
                  </Text>
                </YStack>
                <View onPress={() => buscar(doc.Codigo!)} pressStyle={{ opacity: 0.6 }} hitSlop={10} padding="$1">
                  <RotateCw size={18} color={theme.textMuted?.val} />
                </View>
              </XStack>

              {/* La ÚNICA parte que cambia entre los dos flujos. */}
              {esDiario ? (
                <>
                  <Dato etiqueta="Descripción" valor={doc.Descripcion} />
                  <Dato etiqueta="Tipo" valor={doc.TipoDiario} />
                  <Dato etiqueta="Categoría" valor={doc.CategoriaNombre} />
                  <Dato
                    etiqueta="Almacén"
                    valor={doc.AlmacenOrigen
                      ? `${doc.AlmacenOrigen}${doc.AlmacenDestino ? ` → ${doc.AlmacenDestino}` : ''}`
                      : null}
                  />
                  <Dato etiqueta="Registrado en AX" valor={fmtFechaHora(doc.FechaRegistro) || null} />
                </>
              ) : (
                <>
                  <Dato etiqueta="Cliente" valor={doc.Cliente} />
                  <Dato etiqueta="Fecha de factura" valor={fmtFecha(doc.FechaFactura) || null} />
                  <Dato etiqueta="Pedido de venta" valor={doc.PedidoVenta} />
                </>
              )}

              {/* Avance */}
              <XStack alignItems="center" justifyContent="space-between" marginTop="$2">
                <XStack alignItems="baseline" gap="$1.5">
                  <Text fontSize="$2" color="$textMuted" fontWeight="700">PIEZAS</Text>
                  <Text fontSize="$5" fontWeight="900" color="$text">
                    {fmtCantidad(avance.piezasRevisadas)} / {fmtCantidad(avance.piezas)}
                  </Text>
                </XStack>
                <Text fontSize="$2" color="$textMuted" fontWeight="700">
                  {avance.revisados} / {avance.total} revisados
                </Text>
              </XStack>
              <View height={8} borderRadius={4} backgroundColor="$backgroundSurface" overflow="hidden">
                <View height={8} borderRadius={4} width={`${avance.pct}%`}
                  backgroundColor={avance.completo ? '#22C55E' : ACCENT} />
              </View>

              {/* Validar todo vive ACÁ ARRIBA, en la tarjeta que se ve al escanear.
                  En un documento de cientos de artículos cualquier cosa al fondo
                  está a varias pantallas de scroll — y así queda lejos del botón
                  verde, que es el que deja salir el camión. */}
              {!avance.completo && avance.total > 0 && (
                <View onPress={marcandoTodo ? undefined : pedirValidarTodo}
                  pressStyle={{ opacity: 0.85 }} opacity={marcandoTodo ? 0.5 : 1} marginTop="$2"
                  borderWidth={1} borderColor={ACCENT} borderRadius="$4" height={46}
                  flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
                  {marcandoTodo ? <Spinner color={ACCENT} /> : <ListChecks size={18} color={ACCENT} />}
                  <Text color={ACCENT} fontWeight="800" fontSize="$3">
                    {marcandoTodo
                      ? 'Validando…'
                      : `Validar todo el ${nombre} (${avance.total - avance.revisados})`}
                  </Text>
                </View>
              )}

              {/* Si esto se descartó antes y se volvió a abrir, se dice: una fila
                  en revisión con fecha de descarte no es un error, es el rastro. */}
              {!!doc.FechaDescarte && (
                <Text fontSize="$2" color="$textMuted" marginTop="$1">
                  Se había descartado el {fmtFechaHora(doc.FechaDescarte)}
                  {doc.GuardiaDescarte ? ` por ${doc.GuardiaDescarte}` : ''}
                  {doc.MotivoDescarte ? ` («${doc.MotivoDescarte}»)` : ''} y se volvió a abrir.
                </Text>
              )}

              {/* Descartar y desmarcar viven ACÁ ARRIBA, lejos del botón verde
                  que es el que deja salir el camión. */}
              <XStack alignSelf="center" gap="$4" marginTop="$1">
                <View onPress={descartando ? undefined : pedirDescartar} pressStyle={{ opacity: 0.6 }}
                  flexDirection="row" alignItems="center" gap="$1.5" paddingVertical="$1.5" hitSlop={8}>
                  <Trash2 size={14} color={theme.textMuted?.val} />
                  <Text fontSize="$2" color="$textMuted" fontWeight="700">Descartar</Text>
                </View>
                {avance.revisados > 0 && (
                  <View onPress={marcandoTodo ? undefined : pedirDesmarcarTodo} pressStyle={{ opacity: 0.6 }}
                    flexDirection="row" alignItems="center" gap="$1.5" paddingVertical="$1.5" hitSlop={8}>
                    <Undo2 size={14} color={theme.textMuted?.val} />
                    <Text fontSize="$2" color="$textMuted" fontWeight="700">Desmarcar todo</Text>
                  </View>
                )}
              </XStack>
            </YStack>

            {/* Artículos por artículo + color, tallas como columnas */}
            {grupos.map(g => (
              <GrupoCard key={g.clave} grupo={g} onToggleLinea={toggleLinea} onToggleGrupo={toggleGrupo} />
            ))}

            {/* Confirmar */}
            <View onPress={avance.completo && !confirmando ? confirmar : undefined}
              pressStyle={{ opacity: avance.completo ? 0.85 : 1 }}
              opacity={avance.completo && !confirmando ? 1 : 0.45}
              backgroundColor="#22C55E" borderRadius="$4" height={54}
              flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
              {confirmando ? <Spinner color="#fff" /> : <CheckCircle2 size={22} color="#fff" />}
              <Text color="#fff" fontWeight="800" fontSize="$4">
                {confirmando ? 'Confirmando…' : 'Confirmar salida'}
              </Text>
            </View>
            {!avance.completo && (
              <Text fontSize="$2" color="$textMuted" textAlign="center">
                Faltan {avance.total - avance.revisados} artículos por revisar
              </Text>
            )}

            <BotonOtra onPress={limpiar} texto="Escanear otro" />
          </YStack>
        )}
      </KeyboardAwareForm>

      <ScannerModal
        open={scannerOpen}
        title="Escanear factura"
        hint="Apunta al código de barras de la factura. Los diarios no tienen código: escribí el número."
        onClose={() => setScannerOpen(false)}
        onRead={onScan}
      />
    </View>
  )
}

// ── Piezas de la pantalla ───────────────────────────────────────────────────

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <XStack gap="$2" flexWrap="wrap">
      <Text fontSize="$3" color="$textMuted">{etiqueta}:</Text>
      <Text fontSize="$3" fontWeight="700" color="$text" flex={1}>{valor || '-'}</Text>
    </XStack>
  )
}

function BotonOtra({ onPress, texto = 'Escanear otra' }: { onPress: () => void; texto?: string }) {
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.85 }}
      borderWidth={1} borderColor="$border" borderRadius="$4" height={48}
      flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
      <ScanBarcode size={18} color={ACCENT} />
      <Text color={ACCENT} fontWeight="800" fontSize="$3">{texto}</Text>
    </View>
  )
}
