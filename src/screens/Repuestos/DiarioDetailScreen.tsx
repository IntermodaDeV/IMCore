import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, ScrollView, TextInput } from 'react-native'
import { Text, XStack, YStack, View, Spinner, Input, useTheme } from 'tamagui'
import { ArrowLeft, ScanLine, QrCode, Plus, Trash2, Upload, Package, Ticket, RotateCcw, TriangleAlert, RefreshCw, Search, X } from 'lucide-react-native'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { repuestosService } from '../../api/modules/repuestos/repuestos.service'
import { ILinea } from '../../api/modules/repuestos/repuestos.types'
import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { ITicket } from '../../api/modules/mantenimiento/tickets.types'
import { shadows } from '../../theme/shadows'
import { ACCENT, Field, ScannerModal, puedeDespachar, fmtFechaHora, ts } from './components'

const ERR = '#ef4444'

type ActiveTicket = { Id: number; CodigoTicket: string; Area?: string | null; Operacion?: string | null; Estado?: string | null }
type ScanMode = 'ticket' | 'barcode' | 'ubicacion' | null

export default function DiarioDetailScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { showToast } = useShowToast()

  const journalId: string = route.params?.journalId
  const descripcion: string | undefined = route.params?.descripcion
  const almacenDiario: string = route.params?.almacen ?? '4'
  // Diario cerrado → solo lectura. POSTEADO = rebaja confirmada; ELIMINADO = ya no existe en AX.
  const estadoParam = String(route.params?.estado ?? '').toUpperCase()
  const posteado = estadoParam === 'POSTEADO'
  const eliminado = estadoParam === 'ELIMINADO'
  const cerrado = posteado || eliminado

  const [lineas, setLineas] = useState<ILinea[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [filtro, setFiltro] = useState('')   // filtro sutil: repuesto o ticket

  const [ticket, setTicket] = useState<ActiveTicket | null>(null)
  const [resolviendo, setResolviendo] = useState(false)

  const [manual, setManual] = useState('')   // ingreso manual del código de ticket (respaldo del QR)
  const [barcode, setBarcode] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [ubicacion, setUbicacion] = useState('')
  const [almacen, setAlmacen] = useState(almacenDiario)
  const [agregando, setAgregando] = useState(false)

  const [scanMode, setScanMode] = useState<ScanMode>(null)
  const [posteando, setPosteando] = useState(false)

  const barcodeRef = useRef<TextInput>(null)
  const ubicacionRef = useRef<TextInput>(null)

  const cargarLineas = useCallback(async () => {
    setErrorCarga(null)
    try {
      const res = await repuestosService.getLineas(journalId)
      if (res.Success) setLineas(res.Data ?? [])
      else setErrorCarga(res.ErrorMessage || 'No se pudieron cargar las líneas')
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudieron cargar las líneas')
    } finally {
      setCargando(false)
    }
  }, [journalId])

  // Reintento manual (AX dev puede tener tropiezos intermitentes).
  const reintentar = useCallback(() => { setCargando(true); cargarLineas() }, [cargarLineas])
  // Refresco manual (sin blanquear la lista): recarga las líneas.
  const refrescar = useCallback(async () => { setRefrescando(true); await cargarLineas(); setRefrescando(false) }, [cargarLineas])

  useFocusEffect(useCallback(() => { cargarLineas() }, [cargarLineas]))

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">{journalId}</Text>,
    right: refrescando
      ? <Spinner color={ACCENT} />
      : <RefreshCw color={theme.text?.val} onPress={refrescar} />,
  }, [refrescando, journalId])

  // Valida el estado y activa el ticket. Solo tickets abiertos/activos admiten
  // despacho (PENDIENTE/EN_PROCESO/PAUSADO/RECHAZADO); se bloquea CANCELADO y
  // COMPLETADO (incluido validado). Devuelve false si el ticket no aplica.
  const aplicarTicket = useCallback((t: ITicket): boolean => {
    if (!puedeDespachar(t.EstadoCode)) {
      showToast(
        'warning',
        'Ticket no disponible',
        `${t.CodigoTicket} está ${t.Estado ?? ''}. Solo se despacha a tickets Pendiente, En Proceso, Pausado o Rechazado.`,
        6000,
      )
      return false
    }
    setTicket({ Id: t.Id, CodigoTicket: t.CodigoTicket, Area: t.Area, Operacion: t.Operacion, Estado: t.Estado })
    showToast('success', 'Ticket seleccionado', `${t.CodigoTicket}${t.Estado ? ` · ${t.Estado}` : ''}`)
    setTimeout(() => barcodeRef.current?.focus(), 300)
    return true
  }, [showToast])

  // ── Resolver el ticket escaneado (QR = CodigoTicket, o Id numérico) ──────────
  const resolverTicket = useCallback(async (codigo: string) => {
    const code = codigo.trim()
    setResolviendo(true)
    try {
      // QR con Id numérico (fallback del generador) → búsqueda directa.
      if (/^\d+$/.test(code)) {
        const r = await ticketsService.getTicketById(Number(code))
        if (r.Success && r.Data) { aplicarTicket(r.Data); return }
      }
      // QR con CodigoTicket (MTTO-YYYY-000000): buscar y hacer match exacto.
      const buscar = async (scope?: 'mias' | 'todos') => {
        const r = await ticketsService.getTickets({ search: code, take: 10, ...(scope ? { scope } : {}) })
        return (r.Data ?? []).find(t => (t.CodigoTicket ?? '').trim().toUpperCase() === code.toUpperCase())
      }
      let t = await buscar()
      if (!t) t = await buscar('todos')   // reintenta en el pool (por si no está en su alcance)
      if (t) aplicarTicket(t)
      else showToast('warning', 'Ticket no encontrado', `Código ${code}. Verifica el QR o tu acceso al ticket.`, 5000)
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo resolver el ticket')
    } finally {
      setResolviendo(false)
    }
  }, [aplicarTicket, showToast])

  // ── Agregar repuesto (línea) al ticket activo ────────────────────────────────
  const agregarRepuesto = useCallback(async (codigoBarras?: string) => {
    const bc = (codigoBarras ?? barcode).trim()
    if (!ticket) { showToast('warning', 'Escanea un ticket', 'Primero escanea el QR del ticket'); return }
    if (!bc) { showToast('warning', 'Falta el código', 'Escanea o escribe el código de barras'); return }
    const cant = Number(cantidad) || 1

    setAgregando(true)
    try {
      const res = await repuestosService.agregarLinea(journalId, {
        Barcode: bc,
        Cantidad: cant,
        Ubicacion: ubicacion.trim() || null,
        Almacen: almacen.trim() || almacenDiario,
        Ticket_Id: ticket.Id,
        TicketCodigo: ticket.CodigoTicket,
      })
      const ax = res.Data
      if (res.Success && ax?.Ok) {
        showToast('success', 'Repuesto agregado', ax.Descripcion || bc)
        // Costo de referencia (no bloquea; degrada si el proxy aún no expone costo).
        repuestosService.getCosto(bc)
          .then(r => {
            if (r.Success && (r.Data?.CostoUnitario ?? 0) > 0)
              showToast('info', 'Costo referencia', `${ax.Descripcion || bc}: L ${r.Data.CostoUnitario.toFixed(2)}`, 3000)
          })
          .catch(() => {})
        setBarcode('')
        setCantidad('1')
        await cargarLineas()
        setTimeout(() => barcodeRef.current?.focus(), 200)
      } else if (ax?.Code === 'NO_RESPONSE') {
        showToast('warning', 'AX no respondió', 'La línea quedó pendiente de reconciliar. Revisa antes de reintentar.', 5000)
        await cargarLineas()
      } else {
        showToast('error', 'No se agregó', ax?.Error || ax?.CodError || res.ErrorMessage || 'AX rechazó el repuesto')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo agregar el repuesto')
    } finally {
      setAgregando(false)
    }
  }, [ticket, barcode, cantidad, ubicacion, almacen, almacenDiario, journalId, cargarLineas, showToast])

  // ── Borrar línea ─────────────────────────────────────────────────────────────
  const confirmarBorrar = (l: ILinea) => {
    Alert.alert('Eliminar repuesto', `¿Eliminar ${l.ItemId} (${l.Descripcion})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => borrar(l) },
    ])
  }
  const borrar = async (l: ILinea) => {
    try {
      const res = await repuestosService.borrarLinea(journalId, l.ItemId, l.LineNum)
      if (res.Success && res.Data?.Ok) { showToast('success', 'Repuesto eliminado', l.ItemId); await cargarLineas() }
      else showToast('error', 'No se eliminó', res.Data?.Error || res.ErrorMessage || 'AX rechazó la eliminación')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo eliminar')
    }
  }

  // ── Postear ──────────────────────────────────────────────────────────────────
  const confirmarPostear = () => {
    if (lineas.length === 0) { showToast('warning', 'Diario vacío', 'Agrega al menos un repuesto antes de postear'); return }
    Alert.alert(
      'Postear diario',
      `Se ejecutará la rebaja en AX de ${lineas.length} ${lineas.length === 1 ? 'línea' : 'líneas'}. Esta acción no se puede deshacer. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Postear', onPress: postear },
      ],
    )
  }
  const postear = async () => {
    setPosteando(true)
    try {
      const res = await repuestosService.postear(journalId)
      const ax = res.Data
      if (res.Success && ax?.Ok) {
        showToast('success', 'Diario posteado', journalId)
        navigation.goBack()
      } else if (ax?.Code === 'NO_RESPONSE') {
        showToast('warning', 'AX no respondió', 'No se confirmó el posteo. Verifica en AX antes de reintentar.', 5000)
      } else {
        showToast('error', 'No se posteó', ax?.Error || res.ErrorMessage || 'AX rechazó el posteo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo postear')
    } finally {
      setPosteando(false)
    }
  }

  const fmtL = (n: number) => `L ${(n || 0).toFixed(2)}`

  // Costo total del diario (todas las líneas, sin filtrar).
  const totalDiario = useMemo(
    () => lineas.reduce((s, l) => s + (l.Costo != null ? l.Costo * Math.abs(l.Cantidad) : 0), 0),
    [lineas],
  )

  // Filtro sutil por repuesto (item/desc/barcode) o ticket.
  const lineasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return lineas
    return lineas.filter(l =>
      (l.ItemId || '').toLowerCase().includes(q) ||
      (l.Descripcion || '').toLowerCase().includes(q) ||
      (l.Barcode || '').toLowerCase().includes(q) ||
      (l.TicketCodigo || '').toLowerCase().includes(q))
  }, [lineas, filtro])

  // Líneas agrupadas por ticket (un diario puede tener varios tickets).
  // Ordenado DESC por fecha: líneas más recientes primero y grupos por su línea más nueva.
  const grupos = useMemo(() => {
    const ordenadas = [...lineasFiltradas].sort((a, b) => ts(b.Fecha) - ts(a.Fecha))
    const map = new Map<string, ILinea[]>()
    for (const l of ordenadas) {
      const key = l.TicketCodigo || 'Sin ticket'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    return Array.from(map.entries()).sort((A, B) => ts(B[1][0]?.Fecha) - ts(A[1][0]?.Fecha))
  }, [lineasFiltradas])

  const onScan = (code: string) => {
    const mode = scanMode
    setScanMode(null)
    if (mode === 'ticket') resolverTicket(code)
    else if (mode === 'ubicacion') { setUbicacion(code); setTimeout(() => barcodeRef.current?.focus(), 250) }
    else if (mode === 'barcode') { setBarcode(code); agregarRepuesto(code) }
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled">
        <YStack width="100%" maxWidth={800} alignSelf="center">

          {(!!descripcion || !!almacenDiario) && (
            <XStack marginBottom="$3" gap="$2" alignItems="center" flexWrap="wrap">
              {!!descripcion && <Text fontSize="$3" color="$textMuted">{descripcion}</Text>}
              {!!almacenDiario && <Text fontSize="$2" color="$textMuted">· Almacén {almacenDiario}</Text>}
            </XStack>
          )}

          {cerrado && (
            <View marginBottom="$4" borderWidth={1} borderColor="$border" borderRadius={12}
              backgroundColor={eliminado ? 'rgba(239,68,68,0.10)' : 'rgba(107,114,128,0.10)'}
              padding="$3.5" flexDirection="row" alignItems="center" gap="$2.5">
              {eliminado ? <TriangleAlert size={18} color="#dc2626" /> : <Upload size={18} color="#6b7280" />}
              <YStack flex={1}>
                <Text fontSize="$4" fontWeight="800" color="$text">{eliminado ? 'Diario eliminado en AX' : 'Diario posteado'}</Text>
                <Text fontSize="$2" color="$textMuted">
                  {eliminado
                    ? 'Este diario ya no existe en AX. Es solo lectura (historial); crea un diario nuevo para despachar.'
                    : 'La rebaja ya se ejecutó en AX. Es solo lectura; para más despachos crea un diario nuevo.'}
                </Text>
              </YStack>
            </View>
          )}

          {!cerrado && (<>
          {/* Ticket activo */}
          <YStack marginBottom="$4" gap="$2">
            <Text fontSize="$3" fontWeight="700" color="$text">Ticket de mantenimiento</Text>
            {ticket ? (
              <View borderWidth={1.5} borderColor={ACCENT} borderRadius={12} backgroundColor="$backgroundElevated"
                padding="$3.5" gap="$1.5" {...shadows.sm}>
                <XStack alignItems="center" justifyContent="space-between">
                  <XStack alignItems="center" gap="$2">
                    <Ticket size={18} color={ACCENT} />
                    <Text fontSize="$6" fontWeight="900" color={ACCENT}>{ticket.CodigoTicket}</Text>
                  </XStack>
                  <XStack alignItems="center" gap="$1.5" onPress={() => setScanMode('ticket')} pressStyle={{ opacity: 0.7 }} hitSlop={8}>
                    <RotateCcw size={15} color={theme.textMuted?.val} />
                    <Text fontSize="$2" color="$textMuted">Cambiar</Text>
                  </XStack>
                </XStack>
                {(ticket.Area || ticket.Operacion) && (
                  <Text fontSize="$2" color="$textMuted">
                    {[ticket.Area, ticket.Operacion].filter(Boolean).join('  ·  ')}
                  </Text>
                )}
                {!!ticket.Estado && <Text fontSize="$2" color="$textMuted">Estado: {ticket.Estado}</Text>}
              </View>
            ) : (
              <YStack gap="$2">
                <View onPress={() => setScanMode('ticket')} pressStyle={{ opacity: 0.85 }}
                  borderWidth={1.5} borderColor={ACCENT} borderStyle="dashed" borderRadius={12}
                  padding="$4" alignItems="center" justifyContent="center" gap="$2" backgroundColor="$backgroundElevated">
                  {resolviendo ? <Spinner color={ACCENT} /> : <QrCode size={30} color={ACCENT} />}
                  <Text fontSize="$4" fontWeight="800" color={ACCENT}>Escanear QR del ticket</Text>
                  <Text fontSize="$2" color="$textMuted" textAlign="center">
                    Escanea el ticket para ligarle los repuestos que despacharás.
                  </Text>
                </View>
                {/* Respaldo: ingresar el código del ticket manualmente (QR dañado o sin lector). */}
                <XStack alignItems="center" gap="$2">
                  <Input flex={1} height={46} borderWidth={1} borderColor="$border" borderRadius={8}
                    backgroundColor="$backgroundElevated" paddingHorizontal="$3" fontSize="$4" color="$text"
                    autoCapitalize="characters" placeholder="o escribe el código (MTTO-…)"
                    placeholderTextColor={theme.textMuted?.val}
                    value={manual} onChangeText={setManual}
                    onSubmitEditing={() => { const c = manual.trim(); if (c) { resolverTicket(c); setManual('') } }} />
                  <View onPress={() => { const c = manual.trim(); if (c) { resolverTicket(c); setManual('') } }}
                    pressStyle={{ opacity: 0.8 }} backgroundColor={ACCENT} borderRadius={8}
                    height={46} paddingHorizontal="$4" alignItems="center" justifyContent="center">
                    <Text color="#fff" fontWeight="800">Buscar</Text>
                  </View>
                </XStack>
              </YStack>
            )}
          </YStack>

          {/* Agregar repuesto (sólo con ticket activo) */}
          {ticket && (
            <YStack marginBottom="$4" padding="$3.5" borderWidth={1} borderColor="$border" borderRadius={12}
              backgroundColor="$backgroundElevated" gap="$1">
              <Text fontSize="$3" fontWeight="700" color="$text" marginBottom="$2">Agregar repuesto</Text>

              {/* Ubicación primero: en la PDA se escanea la etiqueta de ubicación y el
                  foco salta al código de barras; al escanear el repuesto se agrega. */}
              <Field label="Ubicación" hint="escanea la ubicación (opcional)">
                <XStack alignItems="center" height={50} borderWidth={1} borderColor="$border" borderRadius={8}
                  backgroundColor="$background" overflow="hidden">
                  <Input ref={ubicacionRef as any} flex={1} unstyled height="100%" paddingHorizontal="$3" fontSize="$5" color="$text"
                    placeholder="Ej. 021112-01" placeholderTextColor={theme.textMuted?.val}
                    autoCapitalize="characters" returnKeyType="next" blurOnSubmit={false}
                    value={ubicacion} onChangeText={setUbicacion} onSubmitEditing={() => barcodeRef.current?.focus()} />
                  <View height="100%" width={54} alignItems="center" justifyContent="center"
                    backgroundColor={ACCENT} pressStyle={{ opacity: 0.8 }} onPress={() => setScanMode('ubicacion')}>
                    <ScanLine size={22} color="#fff" />
                  </View>
                </XStack>
              </Field>

              <Field label="Código de barras" hint="escanea o usa el lector">
                <XStack alignItems="center" height={50} borderWidth={1} borderColor="$border" borderRadius={8}
                  backgroundColor="$background" overflow="hidden">
                  <Input ref={barcodeRef as any} flex={1} unstyled height="100%" paddingHorizontal="$3" fontSize="$5" color="$text"
                    placeholder="Escanea o escribe" placeholderTextColor={theme.textMuted?.val}
                    autoCapitalize="characters" returnKeyType="done" blurOnSubmit={false}
                    value={barcode} onChangeText={setBarcode} onSubmitEditing={() => agregarRepuesto()} />
                  <View height="100%" width={54} alignItems="center" justifyContent="center"
                    backgroundColor={ACCENT} pressStyle={{ opacity: 0.8 }} onPress={() => setScanMode('barcode')}>
                    <ScanLine size={22} color="#fff" />
                  </View>
                </XStack>
              </Field>

              <XStack gap="$3">
                <YStack flex={1}>
                  <Field label="Cantidad">
                    <Input height={48} borderWidth={1} borderColor="$border" borderRadius={8}
                      backgroundColor="$background" paddingHorizontal="$3" fontSize="$5" color="$text"
                      keyboardType="numeric" value={cantidad}
                      onChangeText={t => setCantidad(t.replace(/[^\d.]/g, ''))} />
                  </Field>
                </YStack>
                <YStack flex={1}>
                  <Field label="Almacén">
                    <Input height={48} borderWidth={1} borderColor="$border" borderRadius={8}
                      backgroundColor="$background" paddingHorizontal="$3" fontSize="$5" color="$text"
                      keyboardType="number-pad" value={almacen}
                      onChangeText={t => setAlmacen(t.replace(/\D/g, ''))} />
                  </Field>
                </YStack>
              </XStack>

              <View onPress={agregando ? undefined : () => agregarRepuesto()} pressStyle={{ opacity: 0.85 }}
                opacity={agregando ? 0.7 : 1} backgroundColor={ACCENT} borderRadius="$4" height={48}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2" marginTop="$1">
                {agregando ? <Spinner color="#fff" /> : <Plus size={20} color="#fff" />}
                <Text color="#fff" fontWeight="800" fontSize="$4">{agregando ? 'Agregando…' : 'Agregar repuesto'}</Text>
              </View>
            </YStack>
          )}
          </>)}

          {/* Líneas agrupadas por ticket */}
          <XStack alignItems="center" justifyContent="space-between" marginBottom="$2" gap="$2" flexWrap="wrap">
            <Text fontSize="$3" fontWeight="700" color="$text">Repuestos del diario ({lineas.length})</Text>
            {totalDiario > 0 && <Text fontSize="$3" fontWeight="900" color={ACCENT}>Total {fmtL(totalDiario)}</Text>}
          </XStack>

          {!cargando && !errorCarga && lineas.length > 0 && (
            <XStack alignItems="center" gap="$2" marginBottom="$3" borderWidth={1} borderColor="$border"
              borderRadius={8} backgroundColor="$backgroundElevated" paddingHorizontal="$3" height={42}>
              <Search size={16} color={theme.textMuted?.val} />
              <Input flex={1} unstyled height="100%" fontSize="$3" color="$text" autoCapitalize="none"
                placeholder="Filtrar repuesto o ticket…" placeholderTextColor={theme.textMuted?.val}
                value={filtro} onChangeText={setFiltro} />
              {filtro.length > 0 && (
                <View onPress={() => setFiltro('')} hitSlop={8} pressStyle={{ opacity: 0.6 }}>
                  <X size={16} color={theme.textMuted?.val} />
                </View>
              )}
            </XStack>
          )}

          {cargando ? (
            <YStack alignItems="center" paddingVertical="$6" gap="$2">
              <Spinner color={ACCENT} />
              <Text color="$textMuted">Cargando…</Text>
            </YStack>
          ) : errorCarga ? (
            <YStack alignItems="center" paddingVertical="$6" gap="$3">
              <TriangleAlert size={40} color={ERR} />
              <Text color="$textMuted" textAlign="center">No se pudieron cargar las líneas.{'\n'}Puede ser un tropiezo momentáneo de AX; intenta de nuevo.</Text>
              <View onPress={reintentar} pressStyle={{ opacity: 0.85 }} backgroundColor={ACCENT} borderRadius="$4"
                height={44} paddingHorizontal="$4" flexDirection="row" alignItems="center" gap="$2">
                <RotateCcw size={18} color="#fff" />
                <Text color="#fff" fontWeight="800">Reintentar</Text>
              </View>
            </YStack>
          ) : lineas.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$6" gap="$2">
              <Package size={40} color={theme.textMuted?.val} />
              <Text color="$textMuted" textAlign="center">Aún no hay repuestos.{'\n'}Escanea un ticket y agrega repuestos.</Text>
            </YStack>
          ) : grupos.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$5" gap="$2">
              <Search size={32} color={theme.textMuted?.val} />
              <Text color="$textMuted" textAlign="center">Sin coincidencias para “{filtro}”.</Text>
            </YStack>
          ) : (
            grupos.map(([codigo, items]) => {
              const subtotal = items.reduce((s, l) => s + (l.Costo != null ? l.Costo * Math.abs(l.Cantidad) : 0), 0)
              return (
              <YStack key={codigo} marginBottom="$4">
                <XStack alignItems="center" gap="$2" marginBottom="$2" marginTop="$1" flexWrap="wrap">
                  <Ticket size={15} color={ACCENT} />
                  <Text fontSize="$3" fontWeight="800" color="$text">{codigo}</Text>
                  <Text fontSize="$2" color="$textMuted">· {items.length} {items.length === 1 ? 'repuesto' : 'repuestos'}</Text>
                  {subtotal > 0 && <Text fontSize="$2" color={ACCENT} fontWeight="800">· L {subtotal.toFixed(2)}</Text>}
                </XStack>
                {items.map(l => (
                  <View key={`${l.LineNum}-${l.Barcode}`} backgroundColor="$backgroundElevated" borderRadius={10}
                    borderWidth={1} borderColor="$border" padding="$3" marginBottom="$2">
                    <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
                      <YStack flex={1} gap="$1">
                        <Text fontSize="$4" fontWeight="800" color="$text">{l.ItemId}</Text>
                        <Text fontSize="$2" color="$textMuted" numberOfLines={2}>{l.Descripcion}</Text>
                        <XStack gap="$4" flexWrap="wrap" marginTop="$1">
                          <Text fontSize="$2" color="$text">Cant: <Text fontWeight="800">{Math.abs(l.Cantidad)}</Text></Text>
                          {!!l.Almacen && <Text fontSize="$2" color="$textMuted">Alm: {l.Almacen}</Text>}
                          {!!l.Ubicacion && <Text fontSize="$2" color="$textMuted">Ubic: {l.Ubicacion}</Text>}
                        </XStack>
                        {l.Costo != null && (
                          <Text fontSize="$2" color={ACCENT} fontWeight="700" marginTop="$1">
                            C/U: L {l.Costo.toFixed(2)}  ·  Total: L {(l.Costo * Math.abs(l.Cantidad)).toFixed(2)}
                          </Text>
                        )}
                        {!!l.Fecha && <Text fontSize="$1" color="$textMuted" marginTop="$1">{fmtFechaHora(l.Fecha)}</Text>}
                      </YStack>
                      {!cerrado && (
                        <View onPress={() => confirmarBorrar(l)} pressStyle={{ opacity: 0.6 }} hitSlop={8} padding="$1">
                          <Trash2 size={18} color={ERR} />
                        </View>
                      )}
                    </XStack>
                  </View>
                ))}
              </YStack>
              )
            })
          )}
        </YStack>
      </ScrollView>

      {/* Barra inferior: Postear (solo en diarios abiertos) */}
      {!cerrado && (
        <View position="absolute" left={0} right={0} bottom={0} paddingHorizontal={16} paddingTop={10} paddingBottom={20}
          backgroundColor="$background" borderTopWidth={1} borderTopColor="$border">
          <View onPress={posteando ? undefined : confirmarPostear} pressStyle={{ opacity: 0.85 }}
            opacity={posteando || lineas.length === 0 ? 0.6 : 1}
            backgroundColor={ACCENT} borderRadius="$4" height={52}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            {posteando ? <Spinner color="#fff" /> : <Upload size={20} color="#fff" />}
            <Text color="#fff" fontWeight="800" fontSize="$4">{posteando ? 'Posteando…' : 'Postear diario'}</Text>
          </View>
        </View>
      )}

      <ScannerModal
        open={scanMode !== null}
        title={scanMode === 'ticket' ? 'Escanea el QR del ticket' : scanMode === 'ubicacion' ? 'Escanea la ubicación' : 'Escanea el repuesto'}
        hint={scanMode === 'ticket' ? 'Apunta al QR del ticket de mantenimiento.' : scanMode === 'ubicacion' ? 'Apunta a la etiqueta de la ubicación.' : 'Apunta al código de barras del repuesto.'}
        onClose={() => setScanMode(null)}
        onRead={onScan}
      />
    </View>
  )
}
