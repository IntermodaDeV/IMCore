import { createTamagui } from 'tamagui'
import { defaultConfig } from '@tamagui/config/v5'
import { animations } from './animations'

const BrandColors = {
  // =========================
  // BRAND
  // =========================
  primary: '#FF551A',
  primaryOpacity: 'rgba(255, 85, 26, 0.20)',

  // =========================
  // STATUS
  // =========================
  success: '#22C55E',
  successOpacity: 'rgba(34, 197, 94, 0.20)',

  warning: '#EAB308',
  warningOpacity: 'rgba(234, 179, 8, 0.20)',

  error: '#EF4444',
  errorOpacity: 'rgba(239, 68, 68, 0.20)',

  info: '#3B82F6',
  infoOpacity: 'rgba(59, 130, 246, 0.20)',
}

export const config = createTamagui({
  ...defaultConfig,

  animations,

  tokens: {
    ...defaultConfig.tokens,

    color: {
      white: '#FFFFFF',
      black: '#000000',
      gray: '#c1baba',

      ...BrandColors,
    },
  },

  themes: {
    light: {
      // =========================
      // SURFACES
      // =========================
      background: '#FFFFFF',
      backgroundPage: '#F8FAFC',
      backgroundSurface: '#F1F5F9',
      backgroundElevated: '#FFFFFF',

      // =========================
      // TEXT
      // =========================
      text: '#0F172A',
      textSecondary: '#475569',
      textMuted: '#94A3B8',
      textDisabled: '#CBD5E1',

      // =========================
      // BORDERS
      // =========================
      border: '#E2E8F0',
      borderColor: '#E2E8F0',

      // =========================
      // BRAND
      // =========================
      primary: '#FF551A',
      primaryOpacity: 'rgba(255, 85, 26, 0.20)',
      secondary: '#001F3F',

      // =========================
      // BUTTONS
      // =========================
      buttonPrimary: '#FF551A',
      buttonPrimaryText: '#FFFFFF',

      buttonSecondary: '#F1F5F9',
      buttonSecondaryText: '#0F172A',

      // =========================
      // STATUS
      // =========================
      success: '#22C55E',
      warning: '#EAB308',
      error: '#EF4444',
      info: '#3B82F6',

      // =========================
      // OVERLAYS
      // =========================
      backgroundLoader: 'rgba(0,0,0,0.35)',
    },

    dark: {
      // =========================
      // SURFACES
      // =========================
      background: '#0E1117',
      backgroundPage: '#12161D',      
      backgroundSurface: '#171C24', 
      backgroundElevated: '#1D232D',

      // =========================
      // TEXT
      // =========================
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      textDisabled: '#64748B',

      // =========================
      // BORDERS
      // =========================
      border: '#888888',
      borderColor: '#1F252E',

      // =========================
      // BRAND
      // =========================
      primary: '#FF551A',
      primaryOpacity: 'rgba(255, 85, 26, 0.20)',
      secondary: '#7292B8',

      // =========================
      // BUTTONS
      // =========================
      buttonPrimary: '#FF551A',
      buttonPrimaryText: '#FFFFFF',

      buttonSecondary: '#232B36',
      buttonSecondaryText: '#F8FAFC',

      // =========================
      // STATUS
      // =========================
      success: '#22C55E',
      warning: '#EAB308',
      error: '#EF4444',
      info: '#3B82F6',

      // =========================
      // OVERLAYS
      // =========================
      backgroundLoader: 'rgba(255,255,255,0.08)',
    },
  },
})