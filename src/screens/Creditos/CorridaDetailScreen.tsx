import React, { useCallback, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
import { TriangleAlert } from 'lucide-react-native'
import { useFocusEffect, useRoute } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { administracionPaquetesService as svc } from '../../api/modules/creditos/administracionPaquetes.service'
import { ICorrida } from '../../api/modules/creditos/administracionPaquetes.types'
import { shadows } from '../../theme/shadows'
import {
  ACCENT, BarraCobertura, Dato, EstadoChip, ModoChip, PROCESO, cobertura, colorCobertura,
  fmtDuracion, fmtFechaHora, fmtNum,
} from './components'

// El resumen de UNA corrida: cómo quedó. Es a donde lleva la notificación
// «Datos de AX listos» / «Falló la carga».
//
// Solo lectura. El detalle por cliente y por SKU NO se trae: son cientos de
// filas que en el teléfono no se leen, y para eso está el web.
export default function CorridaDetailScreen() {
  const route = useRoute<any>()
  const id: number = route.params?.id
  const { showToast } = useShowToast()

  const [c, setC] = useState<ICorrida | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Corrida #{id}</Text>,
  }, [id])

  const cargar = useCallback(async () => {
    try {
      const res = await svc.getCorrida(id)
      if (res.Success) setC(res.Data)
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intentá de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar la corrida')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  if (cargando) {
    return <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
  }
  if (!c) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Text color="$textMuted" textAlign="center">No se encontró la corrida #{id}.</Text>
      </YStack>
    )
  }

  const pct = cobertura(c)
  const proc = c.ProcesoEstado ? PROCESO[c.ProcesoEstado] : null
  const sinRepartir = (c.TotalUnidadesMeta ?? 0) - (c.TotalUnidadesAdmin ?? 0)

  const Tarjeta = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
      borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
      <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">{titulo}</Text>
      {children}
    </YStack>
  )

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={refrescando} tintColor={ACCENT}
          onRefresh={() => { setRefrescando(true); cargar() }} />
      }
    >
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Text fontSize="$6" fontWeight="800" color="$text">{c.CodigoPaquete}</Text>
        <ModoChip modo={c.Modo} />
        <EstadoChip estado={c.Estado} />
      </XStack>
      {!!c.Descripcion && <Text fontSize="$3" color="$textMuted">{c.Descripcion}</Text>}

      {/* Si la carga falló, eso va ARRIBA de todo: es la razón por la que la
          persona abrió el aviso, y el texto del error es lo único accionable. */}
      {c.ProcesoEstado === 'ERROR' && (
        <YStack backgroundColor="rgba(239,68,68,0.10)" borderRadius="$4" padding="$3.5" gap="$1.5">
          <XStack alignItems="center" gap="$2">
            <TriangleAlert size={16} color="#dc2626" />
            <Text fontSize="$3" fontWeight="800" color="#dc2626">Falló la carga de datos de AX</Text>
          </XStack>
          {!!c.ProcesoError && <Text fontSize="$2" color="$text">{c.ProcesoError}</Text>}
          <Text fontSize="$2" color="$textMuted">
            Se vuelve a intentar desde el sistema web, con «Traer insumos».
          </Text>
        </YStack>
      )}

      <Tarjeta titulo="Cómo quedó el reparto">
        {pct !== null ? (
          <>
            <XStack alignItems="baseline" gap="$2">
              <Text fontSize="$9" fontWeight="800" color={colorCobertura(pct)}>{pct}%</Text>
              <Text fontSize="$3" color="$textMuted">de cobertura</Text>
            </XStack>
            <BarraCobertura pct={pct} />
            {/* Qué significa el número, porque «cobertura» no se explica solo. */}
            <Text fontSize="$2" color="$textMuted">
              De {fmtNum(c.TotalUnidadesMeta)} unidades que había que repartir, se colocaron{' '}
              {fmtNum(c.TotalUnidadesAdmin)}.
              {sinRepartir > 0
                ? ` Quedaron ${fmtNum(sinRepartir)} sin repartir: los pedidos de los clientes elegidos no alcanzaban.`
                : ' Se repartió todo.'}
            </Text>
            <View height={1} backgroundColor="$border" marginVertical="$1" />
            <Dato label="Clientes afectados"
              valor={`${fmtNum(c.TotalClientesAfect)} de ${fmtNum(c.TotalClientesSel)}`} />
            <Dato label="Líneas de pedido tocadas" valor={fmtNum(c.TotalLineasTocadas)} />
            <Dato label="SKU del balance" valor={fmtNum(c.TotalSku)} />
          </>
        ) : (
          <>
            <Text fontSize="$4" fontWeight="700" color={proc?.fg ?? '$textMuted'}>
              {proc?.txt ?? 'Todavía sin calcular'}
            </Text>
            <Text fontSize="$2" color="$textMuted">
              El reparto se calcula desde el sistema web, después de cargar el BALANCE y la
              Salud Financiera.
            </Text>
            <Dato label="Clientes en la corrida" valor={fmtNum(c.TotalClientesSel)} />
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Tiempos">
        <Dato label="Creada" valor={fmtFechaHora(c.Creation_Date)} />
        <Dato label="Datos de AX" valor={fmtFechaHora(c.FechaInsumos)} />
        {c.ProcesoSegundos != null && (
          <Dato label="Tardó la carga" valor={fmtDuracion(c.ProcesoSegundos)} />
        )}
        {(c.ProcesoIntento ?? 0) > 1 && (
          <Dato label="Intentos" valor={String(c.ProcesoIntento)} />
        )}
        <Dato label="Calculada" valor={fmtFechaHora(c.FechaCalculo)} />
      </Tarjeta>

      {/* Con qué criterios se repartió. Es lo que permite explicar meses después
          por qué a un cliente se le recortó lo que se le recortó. */}
      <Tarjeta titulo="Con qué criterios se repartió">
        <Dato label="Mora" valor={String(c.W1_Mora)} />
        <Dato label="Volumen" valor={String(c.W2_Volumen)} />
        <Dato label="Afectación" valor={String(c.W3_Afectacion)} />
        <Dato label="Retenidos" valor={String(c.W4_Retenidos)} />
        {c.Modo === 'SOBRANTES' && (
          <Dato label="Factor de ajuste" valor={String(c.FactorAjusteSobrante)} />
        )}
        <Dato label="Empresas" valor={c.Empresas || 'todas'} />
        {c.ExcluirExportacion && <Dato label="Exportación" valor="excluida" />}
        <Text fontSize="$2" color="$textMuted">
          Los cuatro pesos suman 1 y dicen cuánto pesó cada criterio en la decisión.
        </Text>
      </Tarjeta>

      <Text fontSize="$2" color="$textMuted" textAlign="center" marginTop="$2">
        Creada por {c.Create_By}. El detalle por cliente y por SKU está en el sistema web.
      </Text>
    </ScrollView>
  )
}
