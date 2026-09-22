import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Modal, RefreshControl, FlatList, Keyboard, KeyboardAvoidingView, Platform,
  ScrollView as RNScrollView,
} from 'react-native'
import { Text, XStack, YStack, View, Spinner, Input, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { Plus, Pencil, Search, Cog, PowerOff, Archive, ArchiveRestore } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../mantenimiento.helpers'
import { catalogosService, IMaquina, IMaquinaTicketsAbiertos } from '../../../api/modules/mantenimiento/catalogos.service'
import { IArea } from '../../../api/modules/mantenimiento/tickets.types'

export default function MaquinasScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [areas, setAreas] = useState<IArea[]>([])
  const [items, setItems] = useState<IMaquina[]>([])
  const [search, setSearch] = useState('')
  const [areaId, setAreaId] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | undefined>()
  const [fCodigo, setFCodigo] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fModelo, setFModelo] = useState('')
  const [fMarca, setFMarca] = useState('')
  const [fSerie, setFSerie] = useState('')
  const [fAreaId, setFAreaId] = useState<number | undefined>()
  // Titular (Status_Id 1) o extra (2). NO es activa/inactiva: la extra sigue
  // contando en el tablero y en los calculos.
  const [fTitular, setFTitular] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirm, setConfirm] = useState<IMaquina | null>(null)

  // ── Dar de baja / recuperar ───────────────────────────────────────────────
  // `verBajas` cambia la pantalla entera: la lista pasa a traer SOLO las dadas
  // de baja y los botones de cada fila pasan a ser «Recuperar». Es una vista
  // aparte y no un filtro mas porque lo que se puede hacer ahi es otra cosa.
  const [verBajas, setVerBajas] = useState(false)
  const [baja, setBaja] = useState<IMaquina | null>(null)
  // Tickets sin cerrar de esa maquina. Se pide al abrir el dialogo y no con la
  // lista: son ~1,200 maquinas y solo importa la que se va a dar de baja.
  const [bajaAbiertos, setBajaAbiertos] = useState<number | null>(null)
  const [recuperar, setRecuperar] = useState<IMaquina | null>(null)

  useEffect(() => { catalogosService.getAreas(true).then(r => setAreas(r.Data ?? [])).catch(() => {}) }, [])

  // En Android (New Arch + edge-to-edge) el teclado se dibuja ENCIMA: hay que
  // reservar su altura a mano para que el form no quede tapado.
  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKbHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  const cargar = useCallback(async () => {
    try {
      const r = await catalogosService.getMaquinas(search.trim() || undefined, areaId, false, verBajas)
      setItems(r.Data ?? [])
    } catch { setItems([]) }
  }, [search, areaId, verBajas])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [])
  useEffect(() => { const t = setTimeout(() => cargar(), 350); return () => clearTimeout(t) }, [search, areaId, verBajas, cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const abrirCrear = () => {
    setEditId(undefined); setFCodigo(''); setFTipo(''); setFModelo(''); setFMarca(''); setFSerie('')
    setFAreaId(areaId); setFTitular(true); setModalOpen(true)
  }
  const abrirEditar = (m: IMaquina) => {
    setEditId(m.Id); setFCodigo(m.CodigoActivo ?? ''); setFTipo(m.TipoMaquina ?? ''); setFModelo(m.Modelo ?? '')
    setFMarca(m.Marca ?? ''); setFSerie(m.NumeroSerie ?? '')
    setFAreaId(m.Area_Id ?? undefined); setFTitular(m.Status_Id === 1); setModalOpen(true)
  }

  const guardar = async () => {
    if (!fTipo.trim() && !fModelo.trim()) { showToast('warning', 'Faltan datos', 'Indica tipo de máquina o modelo'); return }
    setGuardando(true)
    try {
      // Se mandan TODOS los campos: el SP de edición sobrescribe código/marca/serie
      // con lo que reciba, así que omitirlos los borraría (y sin CodigoActivo la
      // máquina deja de encontrarse al escanear el QR).
      const dto = { Id: editId, CodigoActivo: fCodigo.trim() || null, TipoMaquina: fTipo.trim() || null,
        Modelo: fModelo.trim() || null, Marca: fMarca.trim() || null, NumeroSerie: fSerie.trim() || null,
        Area_Id: fAreaId ?? null,
        ...(editId ? { Status_Id: fTitular ? 1 : 2 } : {}) }
      const res = editId ? await catalogosService.editarMaquina(dto) : await catalogosService.crearMaquina(dto)
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Máquina guardada'); setModalOpen(false); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  // Alterna titular <-> extra. Sigue siendo la misma llamada de siempre; lo que
  // cambio es que la pantalla por fin dice lo que hace.
  const doToggle = async () => {
    if (!confirm) return
    const m = confirm; setConfirm(null)
    try {
      const res = await catalogosService.toggleMaquina(m.Id)
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado'); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
  }

  /** Abre el dialogo de baja y pide el conteo de tickets abiertos. */
  const pedirBaja = async (m: IMaquina) => {
    setBaja(m); setBajaAbiertos(null)
    try {
      const r = await catalogosService.maquinasTicketsAbiertos([m.Id])
      const fila: IMaquinaTicketsAbiertos | undefined = (r.Data ?? [])[0]
      setBajaAbiertos(fila?.Abiertos ?? 0)
    } catch {
      // Si el conteo falla NO se tranca la baja: el aviso es una ayuda, no un
      // requisito. El dialogo lo dice y el usuario decide.
      setBajaAbiertos(-1)
    }
  }

  const doBaja = async () => {
    if (!baja) return
    const m = baja; setBaja(null); setBajaAbiertos(null)
    // Se quita de la lista al instante para que la pantalla responda ya, pero
    // despues se recarga del servidor: el parche es cosmetico, quien manda es el.
    setItems(prev => prev.filter(x => x.Id !== m.Id))
    try {
      const res = await catalogosService.darDeBajaMaquina(m.Id, 3)
      if (res.Success) showToast('success', 'Dada de baja', res.SuccessMessage || 'Máquina dada de baja')
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo dar de baja') }
    // Fuera del try: si la baja fallo, la fila que se quito de la lista tiene que
    // volver. Sin esto la pantalla quedaria mintiendo hasta el siguiente refresco.
    await cargar()
  }

  const doRecuperar = async () => {
    if (!recuperar) return
    const m = recuperar; setRecuperar(null)
    setItems(prev => prev.filter(x => x.Id !== m.Id))
    try {
      const res = await catalogosService.darDeBajaMaquina(m.Id, 0)
      if (res.Success) showToast('success', 'Recuperada', res.SuccessMessage || 'Máquina recuperada')
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo recuperar') }
    await cargar()
  }

  // deps con verBajas y areaId: sin ellas el header se congela con los valores del
  // primer render (usePageHeader solo lo re-aplica cuando cambian sus deps).
  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">{verBajas ? 'Dadas de baja' : 'Máquinas'}</Text>
    ),
    right: (
      <XStack alignItems="center" gap="$3">
        <View onPress={() => { setVerBajas(v => !v); setSearch('') }} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
          {verBajas
            ? <Cog size={21} color={theme.text?.val} />
            : <Archive size={21} color={theme.textMuted?.val} />}
        </View>
        {!verBajas && (
          <View onPress={abrirCrear} pressStyle={{ opacity: 0.6 }} hitSlop={8}><Plus size={22} color={theme.text?.val} /></View>
        )}
      </XStack>
    ),
  }, [verBajas, areaId])

  // Los TRES estados del catalogo, con la misma regla que el tablero del web:
  // Confirmado = 0 manda sobre el Status_Id (la maquina no se ha validado en piso).
  // Titular/Extra NO es activa/inactiva: las dos estan en uso y las dos cuentan.
  const estadoDe = (m: IMaquina) =>
    m.Confirmado === false ? 'sinconfirmar' : m.Status_Id === 1 ? 'titular' : 'extra'
  const ESTADO = {
    titular: { texto: 'Titular', color: '#22c55e', fondo: 'rgba(34, 197, 94, 0.12)' },
    extra: { texto: 'Extra', color: '#ef4444', fondo: 'rgba(239, 68, 68, 0.12)' },
    sinconfirmar: { texto: 'Sin confirmar', color: '#94a3b8', fondo: 'rgba(148, 163, 184, 0.15)' },
  } as const
  const etiqueta = (m: IMaquina) => m.CodigoActivo || m.Modelo || m.TipoMaquina || `#${m.Id}`

  const areaOpts = useMemo(
    () => [{ label: 'Todas las áreas', value: 'all' }, ...areas.map(a => ({ label: a.Name, value: String(a.Id) }))],
    [areas],
  )
  const areaModalOpts = useMemo(() => areas.map(a => ({ label: a.Name, value: String(a.Id) })), [areas])

  return (
    <View flex={1} backgroundColor="$background">
      {/* Búsqueda + filtro por área */}
      <YStack paddingHorizontal="$3" paddingTop="$3" gap="$2">
        <XStack alignItems="center" gap="$2" backgroundColor="$backgroundHover" borderRadius="$4" paddingHorizontal="$3" height={44}>
          <Search size={18} color={theme.textMuted?.val} />
          <Input flex={1} unstyled placeholder="Buscar por tipo, modelo o ubicación" placeholderTextColor={theme.textMuted?.val}
            color="$text" fontSize="$3" value={search} onChangeText={setSearch} />
        </XStack>
        <AppSelect label="Área" value={areaId != null ? String(areaId) : 'all'} options={areaOpts}
          onValueChange={v => setAreaId(v === 'all' || v == null ? undefined : Number(v))} />
        {verBajas && (
          <YStack backgroundColor="rgba(148, 163, 184, 0.12)" borderRadius="$4" padding="$3" gap="$1">
            <Text fontSize={12} fontWeight="800" color="$text">Máquinas dadas de baja</Text>
            <Text fontSize={11} color="$textMuted" lineHeight={16}>
              No salen en el tablero, el listado ni los selectores. Recuperarlas las devuelve
              a lo que eran. Tocá el engranaje de arriba para volver al listado.
            </Text>
          </YStack>
        )}
      </YStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3"><Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando…</Text></YStack>
      ) : (
        // FlatList (virtualizado) en vez de ScrollView + map: con ~1,200 máquinas,
        // renderizarlas todas de golpe saturaba el hilo de JS y hacía que el drawer
        // se quedara pegado / glitcheara (sobre todo en el simulador, más lento).
        // Así solo se renderizan las filas visibles.
        <FlatList
          data={items}
          keyExtractor={(m) => String(m.Id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View height={10} />}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={
            <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
              <Cog size={28} color={theme.textMuted?.val} />
              <Text fontSize="$4" fontWeight="700" color="$text">{verBajas ? 'Ninguna dada de baja' : 'Sin máquinas'}</Text>
              <Text fontSize="$2" color="$textMuted" textAlign="center">
                {verBajas ? 'Las que des de baja aparecen acá para poder recuperarlas.' : 'Ajusta la búsqueda o toca el + para agregar.'}
              </Text>
            </YStack>
          }
          renderItem={({ item: m }) => {
            const est = ESTADO[estadoDe(m)]
            // En la vista de bajas el Status_Id es 3 para todas: lo que importa
            // no es como estan sino a que vuelven al recuperarlas.
            const vuelveA = (m.StatusPrevio_Id ?? 1) === 1 ? 'Titular' : 'Extra'
            return (
              <XStack backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={verBajas ? '$border' : est.color} borderWidth={1} borderColor="$border"
                paddingVertical="$3" paddingHorizontal="$4" alignItems="center" gap="$3" {...shadows.sm}
                onPress={verBajas ? undefined : () => abrirEditar(m)}
                pressStyle={verBajas ? undefined : { opacity: 0.8, scale: 0.99 }}>
                <YStack flex={1} gap="$0.5">
                  <Text fontSize={14} fontWeight="800" color="$text">{m.Modelo || m.TipoMaquina || '—'}</Text>
                  <Text fontSize={12} color="$textMuted">
                    {[m.CodigoActivo, m.TipoMaquina, m.Area || m.Ubicacion].filter(Boolean).join(' · ') || 'Sin detalle'}
                  </Text>
                </YStack>

                {verBajas ? (
                  <>
                    <View backgroundColor="rgba(148, 163, 184, 0.15)" paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                      <Text fontSize={10} color="$textMuted" fontWeight="700">Vuelve como {vuelveA}</Text>
                    </View>
                    <View onPress={() => setRecuperar(m)} pressStyle={{ opacity: 0.6 }} padding="$2" hitSlop={6}>
                      <ArchiveRestore size={18} color="#22c55e" />
                    </View>
                  </>
                ) : (
                  <>
                    {/* El chip alterna titular <-> extra. Una sin confirmar no lo
                        hace: el toggle le cambiaria el Status_Id sin que el chip
                        cambiara (manda el Confirmado), o sea un toque sin efecto
                        visible. Se clasifica desde el tablero del web. */}
                    <View onPress={(e: any) => {
                        e?.stopPropagation?.()
                        if (estadoDe(m) === 'sinconfirmar') {
                          showToast('info', 'Sin confirmar', 'Se valida en piso desde el tablero de máquinas del web.')
                          return
                        }
                        setConfirm(m)
                      }} pressStyle={{ opacity: 0.7 }}
                      backgroundColor={est.fondo} paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                      <Text fontSize={10} color={est.color} fontWeight="700">{est.texto}</Text>
                    </View>
                    <View onPress={(e: any) => { e?.stopPropagation?.(); abrirEditar(m) }} pressStyle={{ opacity: 0.6 }} padding="$1.5" hitSlop={6}>
                      <Pencil size={16} color={theme.primary?.val} />
                    </View>
                    <View onPress={(e: any) => { e?.stopPropagation?.(); pedirBaja(m) }} pressStyle={{ opacity: 0.6 }} padding="$1.5" hitSlop={6}>
                      <PowerOff size={16} color="#ef4444" />
                    </View>
                  </>
                )}
              </XStack>
            )
          }}
        />
      )}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
            {/* El form tiene 6 campos: en pantallas chicas (o con el teclado abierto)
                no cabe completo, así que scrollea dentro de la tarjeta. En Android el
                teclado se dibuja encima (edge-to-edge), por eso el paddingBottom
                dinámico con su altura. */}
            <RNScrollView
              style={{ width: '100%', maxWidth: 460, maxHeight: '100%' }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <YStack width="100%" backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3"
                marginBottom={Platform.OS === 'android' ? kbHeight : 0}>
                <Text fontSize="$5" fontWeight="900" color="$text">{editId ? 'Editar' : 'Nueva'} · Máquina</Text>
                <AppInput label="Código de activo" value={fCodigo} onChangeText={setFCodigo} autoCapitalize="characters"
                  statusMessage="Es el código que se escanea. Solo dígitos se completa a AF-########." />
                <AppInput label="Tipo de máquina" value={fTipo} onChangeText={setFTipo} />
                <AppInput label="Modelo" value={fModelo} onChangeText={setFModelo} />
                <AppInput label="Marca" value={fMarca} onChangeText={setFMarca} />
                <AppInput label="N° de serie" value={fSerie} onChangeText={setFSerie} />
                <AppSelect label="Área / ubicación" value={fAreaId != null ? String(fAreaId) : undefined} options={areaModalOpts}
                  onValueChange={v => setFAreaId(v ? Number(v) : undefined)} placeholder="Selecciona el área" />
                {!!editId && (
                  <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
                    <YStack flex={1} gap="$0.5">
                      <Text fontSize="$3" color="$text" fontWeight="700">{fTitular ? 'Titular' : 'Extra'}</Text>
                      <Text fontSize={11} color="$textMuted">
                        {fTitular ? 'Está operando en el área' : 'Está de respaldo'}
                      </Text>
                    </YStack>
                    <View onPress={() => setFTitular(v => !v)} pressStyle={{ opacity: 0.8 }}
                      width={52} height={30} borderRadius={15} padding={3} justifyContent="center" backgroundColor={fTitular ? ACCENT : '$border'}>
                      <View width={24} height={24} borderRadius={12} backgroundColor="#fff" alignSelf={fTitular ? 'flex-end' : 'flex-start'} />
                    </View>
                  </XStack>
                )}
                <XStack gap="$2.5" marginTop="$1">
                  <View flex={1} onPress={guardando ? undefined : () => setModalOpen(false)} pressStyle={{ opacity: 0.85 }}
                    borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                    <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
                  </View>
                  <View flex={1} onPress={guardando ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
                    opacity={guardando ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                    alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                    {guardando ? <Spinner color="#fff" /> : null}
                    <Text color="#fff" fontWeight="800" fontSize="$3">Guardar</Text>
                  </View>
                </XStack>
              </YStack>
            </RNScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Clasificar titular <-> extra. Hasta hoy este dialogo decia
          «Desactivar / Activar», que es lo UNICO que esta llamada no hace: la
          maquina seguia en el tablero y en los calculos, solo cambiaba de color. */}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o: boolean) => { if (!o) setConfirm(null) }}
        title={confirm?.Status_Id === 1 ? 'Marcar como Extra' : 'Marcar como Titular'}
        message={confirm?.Status_Id === 1
          ? `¿Pasar ${confirm ? etiqueta(confirm) : 'esta máquina'} a Extra (de respaldo)?`
          : `¿Pasar ${confirm ? etiqueta(confirm) : 'esta máquina'} a Titular (operando)?`}
        confirmLabel={confirm?.Status_Id === 1 ? 'Marcar Extra' : 'Marcar Titular'}
        confirmColor={confirm?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={doToggle}
      />

      <ConfirmDialog
        open={!!baja}
        onOpenChange={(o: boolean) => { if (!o) { setBaja(null); setBajaAbiertos(null) } }}
        title="Dar de baja"
        message={`¿Dar de baja ${baja ? etiqueta(baja) : 'esta máquina'}?`}
        confirmLabel="Dar de baja"
        confirmColor="#ef4444"
        onConfirm={doBaja}
        extra={
          <YStack gap="$2">
            <Text fontSize={11} color="$textMuted" lineHeight={16} textAlign="center">
              Deja de aparecer en el tablero, en el listado y en los selectores. Los tickets
              y los indicadores del histórico no cambian. Se puede recuperar después.
            </Text>
            {/* El conteo de tickets abiertos es un AVISO, no un requisito: si no
                se pudo traer, se dice y el usuario decide igual. */}
            {bajaAbiertos === null ? (
              <XStack alignItems="center" justifyContent="center" gap="$2">
                <Spinner size="small" color={ACCENT} />
                <Text fontSize={11} color="$textMuted">Revisando tickets abiertos…</Text>
              </XStack>
            ) : bajaAbiertos < 0 ? (
              <Text fontSize={11} color="$textMuted" textAlign="center">
                No se pudo revisar si tiene tickets abiertos.
              </Text>
            ) : bajaAbiertos > 0 ? (
              <YStack backgroundColor="rgba(239, 68, 68, 0.10)" borderRadius="$3" padding="$2.5" gap="$1">
                <Text fontSize={12} fontWeight="800" color="#ef4444" textAlign="center">
                  Tiene {bajaAbiertos} ticket{bajaAbiertos === 1 ? '' : 's'} sin cerrar
                </Text>
                <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={15}>
                  Se pueden seguir trabajando y cerrando: la baja no los toca.
                </Text>
              </YStack>
            ) : null}
          </YStack>
        }
      />

      <ConfirmDialog
        open={!!recuperar}
        onOpenChange={(o: boolean) => { if (!o) setRecuperar(null) }}
        title="Recuperar máquina"
        message={`¿Devolver ${recuperar ? etiqueta(recuperar) : 'esta máquina'} al parque como ${(recuperar?.StatusPrevio_Id ?? 1) === 1 ? 'Titular' : 'Extra'}?`}
        confirmLabel="Recuperar"
        confirmColor="#22c55e"
        onConfirm={doRecuperar}
      />
    </View>
  )
}
