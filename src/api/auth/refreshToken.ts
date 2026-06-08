import AsyncStorage from '@react-native-async-storage/async-storage'
import Config from 'react-native-config'

export async function refreshAccessToken() {
  try {
    const refreshToken = await AsyncStorage.getItem('refreshToken')
    if (!refreshToken) return null

    const response = await fetch(`${Config.API_URL}Security/refreshToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    await AsyncStorage.setItem('accessToken', data.AccessToken)
    await AsyncStorage.setItem('refreshToken', data.RefreshToken)

    return data.AccessToken
  } catch (error) {
    return null
  }
}