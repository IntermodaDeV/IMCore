import React, { useEffect, useState } from 'react'
import { Modal, ScrollView as RNScrollView } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { X } from 'lucide-react-native'

import { shadows } from '../../theme/shadows'
import { salidaFacturasService } from '../../api/modules/salidaFacturas/salidaFacturas.service'
import { ISalidaCD, TipoSalidaCD } from '../../api/modules/salidaFacturas/salidaFacturas.types'
import {
  ACCENT, Aviso, EstadoBadge, GrupoCard, agruparItems,
  fmtCantidad, fmtFecha, fmtFechaHora, piezasDe,
} from './components'

/**
 * Qué llevaba una factura o un diario, para CONSULTA. Lo pidió quien revisa: en
 * el historial se veía el avance (4/4 artículos, 14 piezas) pero no QUÉ eran
 * esos artículos, y para lo que ya salió no hay otra forma de mirarlo — la
 * pantalla de la puerta lo rechaza justamente porque ya salió.
 *
 * ⚠ SOLO LECTURA, y no es un detalle de la pantalla: usa
 * `SalidaFacturas/Detalle/{codigo}`, que existe para esto. El endpoint de
 * escaneo NO sirve acá por dos razones: daría de alta el registro si no
 * existiera —una consulta no puede crear nada— y en algo ya salido devuelve el
 * bloqueo SIN las líneas, que es exactamente lo que se quiere ver.
 *
 * La matriz es el MISMO componente que usa el guardia, sin los callbacks de
 * marcar: así lo que ve el supervisor es lo que vio el guardia. Si fueran dos
 * componentes, se separarían con el primer cambio.
 */
export function SalidaDetalleModal({
  codigo,
  tipo,
  onClose,
}: {
  codigo: string | null
  tipo?: TipoSalidaCD
  onClose: () => void
}) {
  const theme = useTheme()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<ISalidaCD | null>(null)

  useEffect(() => {
    if (!codigo) { setDoc(null); setError(null); return }
    let vivo = true
    setCargando(true)
    setError(null)
    setDoc(null)
    salidaFacturasService
      .detalleCD(codigo, tipo)
      .then(res => {
        if (!vivo) return
        if (res.Success && res.Data) setDoc(res.Data)
        else setError(res.ErrorMessage || 'No se pudo cargar el detalle')
      })
      .catch((e: any) => { if (vivo) setError(e?.message || 'No se pudo cargar el detalle') })
      .finally(() => { if (vivo) setCargando(false) })
    // Se cancela por bandera: si se cierra y se abre otro mientras la primera
    // respuesta viaja, la vieja llegaría después y pintaría el documento equivocado.
    return () => { vivo = false }
  }, [codigo, tipo])

  const esDiario = (doc?.Tipo ?? tipo) === 'DIARIO'
  const items = doc?.Items ?? []
  const grupos = agruparItems(items)
  const total = items.length
  const revisados = items.filter(i => i.Revisado).length
  const piezas = piezasDe(items)
  const piezasRevisadas = piezasDe(items.filter(i => i.Revisado))
  const pct = total ? Math.round((revisados / total) * 100) : 0
  const completo = total > 0 && revisados === total

  return (
    <Modal visible={!!codigo} animationType="slide" onRequestClose={onClose}>
      <View flex={1} backgroundColor="$background">
        {/* Cabecera fija: el código y el cerrar no se van con el scroll */}
        <XStack alignItems="center" justifyContent="space-between" gap="$2"
          /* El Modal se presenta a pantalla completa y arranca por ENCIMA del
             área segura: con $8 el número quedaba pegado a la isla dinámica. */
          paddingTop={64} paddingHorizontal="$4" paddingBottom="$3"
          borderBottomWidth={1} borderBottomColor="$border">
          <YStack flex={1}>
            <Text fontSize="$6" fontWeight="900" color="$text" numberOfLines={1}>{codigo}</Text>
            <XStack alignItems="center" gap="$2" marginTop={2}>
              <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2}
                backgroundColor={esDiario ? 'rgba(147,51,234,0.15)' : 'rgba(59,130,246,0.15)'}>
                <Text fontSize="$1" fontWeight="800" color={esDiario ? '#9333ea' : '#3b82f6'}>
                  {esDiario ? 'DIARIO' : 'FACTURA'}
                </Text>
              </View>
              {!!doc && <EstadoBadge estado={doc.Estado} />}
              <Text fontSize="$1" color="$textMuted" fontWeight="700">SOLO CONSULTA</Text>
            </XStack>
          </YStack>
          <View onPress={onClose} pressStyle={{ opacity: 0.6 }} hitSlop={12}
            width={40} height={40} borderRadius={20} alignItems="center" justifyContent="center"
            backgroundColor="$backgroundSurface">
            <X size={22} color={theme.text?.val as string} />
          </View>
        </XStack>

        {cargando && (
          <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
            <Spinner size="large" color={ACCENT} />
            <Text color="$textMuted">Cargando detalle…</Text>
          </YStack>
        )}

        {!!error && !cargando && (
          <YStack padding="$4">
            <Aviso tipo="error">
              <Text fontSize="$3" fontWeight="700" color="$text">{error}</Text>
            </Aviso>
          </YStack>
        )}

        {!!doc && !cargando && (
          <RNScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <YStack gap="$3">
              {/* Cabecera del documento: lo único que cambia entre los dos flujos */}
              <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
                borderColor="$border" padding="$4" gap="$2" {...shadows.sm}>
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

                {/* Los DOS guardias, que no siempre son el mismo. Se muestran por
                    separado porque «quién revisó» y «quién dejó salir» son dos
                    responsabilidades distintas. */}
                <View height={1} backgroundColor="$border" marginVertical="$1" />
                <Dato
                  etiqueta="Puso en revisión"
                  valor={doc.GuardiaInicio
                    ? `${doc.GuardiaInicio} · ${fmtFechaHora(doc.FechaInicio)}`
                    : fmtFechaHora(doc.FechaInicio) || null}
                />
                <Dato
                  etiqueta="Confirmó la salida"
                  valor={doc.FechaSalida
                    ? `${doc.GuardiaSalida || '-'} · ${fmtFechaHora(doc.FechaSalida)}`
                    : 'Todavía no salió'}
                />

                {/* Avance */}
                <XStack alignItems="center" justifyContent="space-between" marginTop="$2">
                  <XStack alignItems="baseline" gap="$1.5">
                    <Text fontSize="$2" color="$textMuted" fontWeight="700">PIEZAS</Text>
                    <Text fontSize="$5" fontWeight="900" color="$text">
                      {fmtCantidad(piezasRevisadas)} / {fmtCantidad(piezas)}
                    </Text>
                  </XStack>
                  <Text fontSize="$2" color="$textMuted" fontWeight="700">
                    {revisados} / {total} revisados
                  </Text>
                </XStack>
                <View height={8} borderRadius={4} backgroundColor="$backgroundSurface" overflow="hidden">
                  <View height={8} borderRadius={4} width={`${pct}%`}
                    backgroundColor={completo ? '#22C55E' : ACCENT} />
                </View>
              </YStack>

              {/* El descarte. Se muestra AUNQUE ya no esté descartada: una fila en
                  revisión con fecha de descarte es una que se descartó y se volvió
                  a abrir, y eso es justo lo que un supervisor querría ver. */}
              {!!doc.FechaDescarte && (
                <Aviso tipo="aviso">
                  <Text fontSize="$3" fontWeight="700" color="$text">
                    {doc.MotivoBloqueo === 'DESCARTADA' ? 'Descartada' : 'Se había descartado'}
                  </Text>
                  <Text fontSize="$2" color="$textMuted">
                    {fmtFechaHora(doc.FechaDescarte)}
                    {doc.GuardiaDescarte ? ` · ${doc.GuardiaDescarte}` : ''}
                    {doc.MotivoDescarte ? ` · «${doc.MotivoDescarte}»` : ''}
                  </Text>
                  {doc.MotivoBloqueo !== 'DESCARTADA' && (
                    <Text fontSize="$2" color="$textMuted">
                      Se volvió a abrir y lo que ya estaba contado se conservó.
                    </Text>
                  )}
                </Aviso>
              )}

              {/* Anterior al corte: no va a poder salir nunca, y si no se dice
                  alguien la espera. El texto lo arma el servidor. */}
              {doc.AnteriorAlCorte && doc.MotivoBloqueo !== 'SALIO' && (
                <Aviso tipo="aviso">
                  <Text fontSize="$2" color="$text">
                    {doc.MensajeBloqueo || 'Es anterior al inicio del control de salida.'}
                  </Text>
                </Aviso>
              )}

              {/* Los artículos */}
              {!items.length ? (
                <Aviso tipo="aviso">
                  <Text fontSize="$3" fontWeight="700" color="$text">Sin artículos registrados</Text>
                  <Text fontSize="$2" color="$textMuted">
                    Se creó el encabezado pero las líneas nunca se guardaron. Al volver a escanearlo
                    en la pantalla de la puerta se rellenan desde AX.
                  </Text>
                </Aviso>
              ) : (
                grupos.map(g => <GrupoCard key={g.clave} grupo={g} />)
              )}
            </YStack>
          </RNScrollView>
        )}
      </View>
    </Modal>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <XStack gap="$2" flexWrap="wrap">
      <Text fontSize="$3" color="$textMuted">{etiqueta}:</Text>
      <Text fontSize="$3" fontWeight="700" color="$text" flex={1}>{valor || '-'}</Text>
    </XStack>
  )
}
