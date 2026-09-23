import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Button, Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ArrowLeft, Send, TriangleAlert } from 'lucide-react-native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { administracionPaquetesService as svc } from '../../api/modules/creditos/administracionPaquetes.service'
import { ICorrida, IEstadoEnvioAx } from '../../api/modules/creditos/administracionPaquetes.types'
import { shadows } from '../../theme/shadows'
import {
  ACCENT, BarraCobertura, Dato, EstadoChip, ModoChip, chipProceso, cobertura,
  colorCobertura, fmtDuracion, fmtFechaHora, fmtNum,
} from './components'

// El resumen de UNA corrida: cómo quedó. Es a donde lleva la notificación
// «Datos de AX listos» / «Falló la carga».
//
// Solo lectura. El detalle por cliente y por SKU NO se trae: son cientos de
// filas que en el teléfono no se leen, y para eso está el web.
export default function CorridaDetailScreen() {
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const theme = useTheme()
  const id: number = route.params?.id
  const { showToast } = useShowToast()

  const [c, setC] = useState<ICorrida | null>(null)
  const [envio, setEnvio] = useState<IEstadoEnvioAx | null>(null)
  const [reanudando, setReanudando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  /* La flecha de atrás, no el menú hamburguesa: a esta pantalla se llega desde el
     listado o desde la notificación —que abre el listado y luego el detalle a
     propósito, justo para que «atrás» devuelva al listado y no saque del módulo. */
  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Corrida #{id}</Text>,
  }, [id])

  const cargar = useCallback(async () => {
    try {
      const res = await svc.getCorrida(id)
      if (res.Success) setC(res.Data)
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intentá de nuevo')

      /* El estado del envío va aparte y en silencio: una corrida sin calcular no
         tiene nada que mandar, y que esta consulta falle no puede impedir ver el
         resumen —que es a lo que la mayoría entra—. */
      try {
        const e = await svc.getEstadoEnvio(id)
        setEnvio(e.Success ? e.Data : null)
      } catch { setEnvio(null) }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar la corrida')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  /* EL TELÉFONO COMO TABLERO. Un envío a AX dura media hora: la idea es dejarlo
     subiendo desde el web y mirar acá cómo va, sin tener que tirar para refrescar
     cada tanto. Solo sondea MIENTRAS algo corre y solo con la pantalla enfocada:
     un `setInterval` vivo en una pantalla que nadie mira gasta batería y datos
     para nada. */
  const enCurso = c?.ProcesoEstado === 'EN_CURSO'
  const cargarRef = useRef(cargar)
  cargarRef.current = cargar

  useFocusEffect(useCallback(() => {
    if (!enCurso) return
    const t = setInterval(() => { cargarRef.current() }, 5000)
    return () => clearInterval(t)
  }, [enCurso]))

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
  const proc = chipProceso(c.ProcesoTipo, c.ProcesoEstado)
  const avance = (c.ProcesoPasosTotal ?? 0) > 0
    ? Math.round(((c.ProcesoPaso ?? 0) / (c.ProcesoPasosTotal ?? 1)) * 100)
    : null
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

      {/* LO QUE ESTÁ PASANDO AHORA, arriba de todo. Es la razón por la que alguien
          abre esta pantalla mientras un lote sube: quiere ver si va y cuánto falta,
          no el resumen de cómo quedó el reparto. Se refresca solo cada 5 segundos. */}
      {c.ProcesoEstado === 'EN_CURSO' && (
        <YStack backgroundColor="rgba(29,78,216,0.10)" borderRadius="$4" padding="$3.5" gap="$2">
          <XStack alignItems="center" gap="$2">
            <Spinner size="small" color="#1d4ed8" />
            <Text fontSize="$3" fontWeight="800" color="#1d4ed8">
              {c.ProcesoTipo === 'ENVIO_AX' ? 'Enviando el lote a AX' : 'Trayendo los insumos desde AX'}
            </Text>
            {avance !== null && (
              <Text fontSize="$3" fontWeight="800" color="#1d4ed8" marginLeft="auto">{avance}%</Text>
            )}
          </XStack>

          {avance !== null && (
            <View height={6} borderRadius={3} backgroundColor="rgba(29,78,216,0.20)" overflow="hidden">
              <View height={6} borderRadius={3} backgroundColor="#1d4ed8" width={`${avance}%`} />
            </View>
          )}

          {!!c.ProcesoFase && <Text fontSize="$2" color="$text">{c.ProcesoFase}</Text>}
          {c.ProcesoSegundos != null && (
            <Text fontSize="$2" color="$textMuted">
              lleva {fmtDuracion(c.ProcesoSegundos)}
              {c.ProcesoTipo === 'ENVIO_AX'
                ? ' · podés cerrar la app, sigue corriendo en el servidor'
                : ''}
            </Text>
          )}
        </YStack>
      )}

      {/* RETOMAR DESDE EL TELÉFONO. Normalmente el envío se retoma solo; este botón
          es para cuando ya se intentó varias veces y el sistema pidió ayuda — que es
          justo cuando llega el aviso y la persona está lejos de la computadora.
          Es lo único que la app dispara en este módulo: no crea trabajo nuevo, sigue
          uno que ya se autorizó, y repetirlo no recorta dos veces. */}
      {c.ProcesoEstado !== 'EN_CURSO' && envio != null && envio.Pendientes > 0 && envio.Enviadas > 0 && (
        <YStack backgroundColor="rgba(234,88,12,0.10)" borderRadius="$4" padding="$3.5" gap="$2.5">
          <Text fontSize="$3" fontWeight="800" color="#ea580c">El lote quedó a medias</Text>
          <Text fontSize="$2" color="$text">
            {fmtNum(envio.Enviadas)} de {fmtNum(envio.Total)} líneas están en AX
            {envio.ConError > 0 ? ` · ${fmtNum(envio.ConError)} con error` : ''}.
          </Text>
          <Button size="$3" backgroundColor="#ea580c" color="white" disabled={reanudando}
            icon={reanudando ? undefined : <Send size={16} color="white" />}
            onPress={async () => {
              setReanudando(true)
              const antes = envio.Enviadas
              try {
                const r = await svc.enviarAX(id)
                if (!r.Success) {
                  showToast('error', 'No se pudo retomar', r.ErrorMessage || 'Intentá de nuevo')
                  return
                }

                /* HAY QUE ESPERAR EL RESULTADO, NO SOLO DISPARAR.
                   Antes esto avisaba «envío retomado» y refrescaba de una: como el
                   proceso todavía no había ni empezado, la pantalla salía igualita.
                   Y si lo único pendiente eran líneas que AX rechaza por un motivo
                   de negocio, el intento entero dura 3 segundos —menos que una
                   vuelta del sondeo, que es de 5— así que nadie veía nunca nada
                   cambiar. Visto desde el teléfono, el botón no hacía nada.

                   Así que se espera acá: hasta 40 s, y se dice qué pasó de verdad. */
                let ultimo = envio
                for (let i = 0; i < 13; i++) {
                  await new Promise(r2 => setTimeout(r2, 3000))
                  try {
                    const e = await svc.getEstadoEnvio(id)
                    if (e.Success && e.Data) { ultimo = e.Data; setEnvio(e.Data) }
                  } catch { /* un sondeo perdido no es un error */ }

                  const cor = await svc.getCorrida(id)
                  if (cor.Success && cor.Data) setC(cor.Data)
                  if (cor.Success && cor.Data?.ProcesoEstado !== 'EN_CURSO'
                      && ultimo.Enviadas !== antes) break
                  if (cor.Success && cor.Data?.ProcesoEstado !== 'EN_CURSO' && i >= 1) break
                }

                if (ultimo.Pendientes === 0)
                  showToast('success', 'El lote quedó completo',
                    `${fmtNum(ultimo.Enviadas)} líneas en AX.`)
                else if (ultimo.Enviadas === antes)
                  showToast('error', 'Ninguna pudo entrar',
                    `Las ${fmtNum(ultimo.Pendientes)} que faltan vuelven a fallar por el mismo ` +
                    'motivo. Reintentar no las arregla: hay que corregir el pedido en AX.')
                else
                  showToast('success', 'Envío retomado',
                    `${fmtNum(ultimo.Enviadas - antes)} líneas más entraron · ` +
                    `quedan ${fmtNum(ultimo.Pendientes)}.`)
              } catch (e: any) {
                showToast('error', 'Error', e?.message || 'No se pudo retomar el envío')
              } finally { setReanudando(false) }
            }}>
            {reanudando ? 'Retomando…' : `Enviar lo que falta (${fmtNum(envio.Pendientes)})`}
          </Button>
        </YStack>
      )}

      {/* Si la carga falló, eso va ARRIBA de todo: es la razón por la que la
          persona abrió el aviso, y el texto del error es lo único accionable. */}
      {c.ProcesoEstado === 'ERROR' && (
        <YStack backgroundColor="rgba(239,68,68,0.10)" borderRadius="$4" padding="$3.5" gap="$1.5">
          <XStack alignItems="center" gap="$2">
            <TriangleAlert size={16} color="#dc2626" />
            <Text fontSize="$3" fontWeight="800" color="#dc2626">
            {c.ProcesoTipo === 'ENVIO_AX' ? 'Falló el envío del lote a AX' : 'Falló la carga de datos de AX'}
          </Text>
          </XStack>
          {!!c.ProcesoError && <Text fontSize="$2" color="$text">{c.ProcesoError}</Text>}
          <Text fontSize="$2" color="$textMuted">
            {c.ProcesoTipo === 'ENVIO_AX'
              ? 'Se reintenta desde el sistema web con «Enviar lo que falta». Lo que ya se aplicó queda aplicado: mandar de nuevo no recorta dos veces.'
              : 'Se vuelve a intentar desde el sistema web, con «Traer insumos».'}
          </Text>
        </YStack>
      )}

      {/* EL PAQUETE EN AX, NO LA CORRIDA.
          Quien mira esto desde el teléfono dejó subiendo el lote y lo que quiere
          saber es si el PAQUETE ya está completo — faltantes y sobrantes son dos
          corridas distintas pero una sola entrega. Se muestra apenas hay algo
          confirmado por AX: antes de eso no hay nada que reportar. */}
      {envio != null && envio.PorModo.some(m => m.Enviadas > 0) && (
        <Tarjeta titulo={`El paquete ${c.CodigoPaquete} en AX`}>
          {envio.PorModo.map(m => {
            const completo = m.Pendientes === 0
            return (
              <XStack key={m.Modo} alignItems="center" gap="$2" paddingVertical="$1">
                <YStack flex={1} gap={2}>
                  <Text fontSize="$3" fontWeight="700" color="$text">
                    {m.Modo === 'SOBRANTES' ? 'Sobrantes' : 'Faltantes'}
                  </Text>
                  {/* Con lo que pone cada corrida: si no, alguien que ve 500 líneas
                      arriba y 672 acá no tiene cómo seguir la cuenta. */}
                  <Text fontSize="$2" color="$textMuted">
                    {m.Corridas.map(x =>
                      `#${x.Corrida_Id}${m.Corridas.length > 1 ? ` (${fmtNum(x.Lineas)})` : ''}`
                    ).join(' · ')}
                    {m.Clientes > 0 ? ` · ${fmtNum(m.Clientes)} clientes` : ''}
                  </Text>
                </YStack>
                <YStack alignItems="flex-end" gap={2}>
                  <Text fontSize="$3" fontWeight="800"
                    color={completo ? '#0d9488' : m.ConError > 0 ? '#ea580c' : '$text'}>
                    {fmtNum(m.Enviadas)} de {fmtNum(m.Lineas)} líneas
                  </Text>
                  <Text fontSize="$2" color="$textMuted">{fmtNum(m.Unidades)} unidades en AX</Text>
                </YStack>
              </XStack>
            )
          })}
          {/* Unidades sí se suman entre lotes; clientes y pedidos no, porque el mismo
              cliente puede recibir faltantes y sobrantes y se contaría dos veces. */}
          {envio.PorModo.length > 1 && (
            <>
              <View height={1} backgroundColor="$border" marginVertical="$1" />
              <Dato label="Todo el paquete"
                valor={`${fmtNum(envio.PorModo.reduce((a, m) => a + m.Unidades, 0))} unidades`} />
            </>
          )}
        </Tarjeta>
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
