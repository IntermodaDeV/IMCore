import React from 'react'
import { SvgXml } from 'react-native-svg'
// @ts-ignore — no type declarations for string subpath
import * as _flags from 'country-flag-icons/string/3x2'
const flags = _flags as Record<string, string>

type Props = {
  /** ISO 3166-1 alpha-2 country code, e.g. "HN", "GT", "US" */
  countryCode: string
  width?: number
  height?: number
}

export default function CountryFlag({ countryCode, width = 32, height = 24 }: Props) {
  const svg: string | undefined = flags[countryCode.toUpperCase()]
  if (!svg) return null
  return <SvgXml xml={svg} width={width} height={height} />
}
