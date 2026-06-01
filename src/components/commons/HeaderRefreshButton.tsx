import React from 'react'
import { TouchableOpacity } from 'react-native'
import { RotateCw } from 'lucide-react-native'

type Props = {
  onPress: () => void
}

export default function HeaderRefreshButton({ onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ marginRight: 20 }}
    >
      <RotateCw size={22} color="#FF551A" />
    </TouchableOpacity>
  )
}