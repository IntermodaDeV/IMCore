import { ChevronDown } from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { XStack, View } from 'tamagui'
import { useAuth } from '../context/AuthContext'
import { securityService } from '../api/modules/security/security.service'
import { IUserCompanies } from '../api/modules/security/security.types'
import CountryFlag from '../components/commons/CountryFlag'
import CountryPickerDialog from '../components/commons/CountryPickerDialog'

type Options = {
  /** Se dispara cuando cambia el país seleccionado (incluida la selección inicial). */
  onChange?: (country: IUserCompanies | null) => void
  /** Título del diálogo selector. */
  title?: string
}

/**
 * Encapsula la lógica del selector de país/empresa del header:
 * - Trae las compañías del usuario (vista AdmSys.Vta_UsersCompanies) al enfocar la pantalla.
 * - Mantiene la selección (con país por defecto) y la deja leer/cambiar desde la pantalla.
 * - Devuelve los nodos listos para el header (`HeaderTrigger`) y el cuerpo (`PickerDialog`).
 *
 * Uso típico:
 *   const { countryCode, flagCode, HeaderTrigger, PickerDialog } = useCountrySelector()
 *   usePageHeader({ right: <XStack>{HeaderTrigger}{...}</XStack> }, [flagCode])
 *   useEffect(() => { cargarDatos(countryCode) }, [countryCode])
 *   return (<YStack>{...}{PickerDialog}</YStack>)
 */
export function useCountrySelector(options: Options = {}) {
  const { onChange, title } = options
  const { user, defaultCompany } = useAuth()

  const [countryList, setCountryList] = useState<IUserCompanies[]>([])
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // País activo: el seleccionado o, por defecto, la compañía del AuthContext.
  const selectedCountry = useMemo(
    () => countryList.find(c => Number(c.Company_Id) === selectedCountryId) ?? null,
    [countryList, selectedCountryId]
  )

  // Code -> país que esperan los servicios (PayWeb); CodeIcon -> ISO para la bandera.
  // Para la bandera se prefiere CodeIcon y, si viene vacío, se usa Code. Se usa || para
  // que los strings vacíos también caigan al fallback de la compañía por defecto.
  const countryCode = selectedCountry?.Code || defaultCompany?.Code || ''
  const flagCode =
    selectedCountry?.CodeIcon || selectedCountry?.Code || defaultCompany?.CodeIcon || defaultCompany?.Code || ''

  // Carga las compañías a las que el usuario tiene acceso. La vista ya trae
  // Name/Code/CodeIcon/IsDefault, así que no hace falta cruzar con getCompanies().
  const reload = useCallback(async () => {
    if (!user?.Code) return
    try {
      const resp = await securityService.getCompaniesByUser(user.Code)
      if (resp.Success) {
        const list = (resp.Data ?? []).filter(c => c.Status_Id === 1)
        setCountryList(list)
        setSelectedCountryId(prev => {
          if (prev != null) return prev
          const porDefecto = list.find(c => c.IsDefault) ?? list[0]
          return porDefecto ? Number(porDefecto.Company_Id) : (defaultCompany?.Id ?? null)
        })
      }
    } catch {
      // Si falla, se queda con la compañía por defecto del AuthContext.
    }
  }, [user?.Code, defaultCompany?.Id])

  // Trae la lista al enfocar la pantalla.
  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  // Notifica al consumidor cuando cambia el país (incluida la selección inicial).
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  React.useEffect(() => {
    onChangeRef.current?.(selectedCountry)
  }, [selectedCountry])

  // Nodo para el header (bandera + chevron). Null hasta que haya una bandera resoluble.
  const HeaderTrigger = flagCode ? (
    <View onPress={() => setPickerOpen(true)} pressStyle={{ opacity: 0.6 }}>
      <XStack alignItems="center" gap="$1">
        <CountryFlag countryCode={flagCode} width={26} height={18} />
        <ChevronDown size={14} color="#94A3B8" />
      </XStack>
    </View>
  ) : null

  // Nodo del diálogo selector. Se renderiza en el cuerpo (usa Portal, así que la
  // ubicación visual no importa).
  const PickerDialog = (
    <CountryPickerDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      companies={countryList}
      selectedId={selectedCountryId}
      onSelect={setSelectedCountryId}
      title={title}
    />
  )

  return {
    /** Lista de países/empresas accesibles. */
    countryList,
    /** Id de compañía seleccionada (AdmSys.Companies.Id). */
    selectedCountryId,
    /** Cambia la selección desde la pantalla padre. */
    setSelectedCountryId,
    /** Objeto del país seleccionado (o null). */
    selectedCountry,
    /** Code del país para los servicios (con fallback a la compañía por defecto). */
    countryCode,
    /** Código ISO para la bandera (con fallbacks). */
    flagCode,
    /** Re-obtiene la lista de países. */
    reload,
    /** Abre el diálogo selector manualmente. */
    openPicker: () => setPickerOpen(true),
    /** Nodo bandera + chevron para colocar en el header. */
    HeaderTrigger,
    /** Nodo del diálogo selector para renderizar en el cuerpo. */
    PickerDialog,
  }
}
