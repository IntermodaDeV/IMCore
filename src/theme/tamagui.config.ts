import { createTamagui } from 'tamagui'
import { defaultConfig } from '@tamagui/config/v5'

export const config = createTamagui({
  ...defaultConfig,

  tokens: {
    ...defaultConfig.tokens,
    color: {
      white: '#ffffff',
      primary: '#FF551A',
      secondary: '#001F3F',
      gray: '#5F6368',
      gray2: '#b5b9bd',
    },
  },

  themes: {
    light: {
      background: '#FFFFFF',
      backgroundPage: '#bcbcbc',
      backgroundPage2: '#bcbcbc',
      card: '#e2dddd',
      card2: '#FFFFFF',
      textMuted: '#64748B',
      border: '#E2E8F0',
      primary: '#FF551A',
      button: '#000000',
      text: '#0F172A', 
      borderColor: '#0F172A',
      buttonPrimary: '#FF551A',
      buttonCancel: '#E2E8F0',
      buttonCancelText: '#0F172A', 
      textUser: '#e2dddd',
    },

    dark: {
      background: '#0B1220',
      backgroundPage: '#070f18',
      card: '#111827',
      card2: '#1e3a5f',
      textMuted: '#94A3B8',
      border: '#1F2937',
      primary: '#FF551A',
      button: '#ffffff',
      text: '#FFFFFF', 
      borderColor: '#c9d8fa', 
      buttonPrimary: '#FF551A',
      buttonCancel: '#bcbcbc',
      buttonCancelText: '#FFFFFF',
      textUser: '#1e3a5f',
    },
  },
})