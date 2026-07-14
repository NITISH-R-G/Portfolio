import { useState, useMemo } from 'react'
import { portfolioData as defaults } from '../data/portfolio'

const STORAGE_KEY = 'portfolio-draft'

function loadDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    return JSON.parse(saved)
  } catch {
    return null
  }
}

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export function usePortfolio() {
  const data = useMemo(() => {
    const draft = loadDraft()
    if (!draft) return defaults
    return deepMerge(defaults, draft)
  }, [])
  return data
}

export function useTheme() {
  return usePortfolio().site.theme
}

export function useMotion() {
  return usePortfolio().site.motion
}

export function useProfile() {
  return usePortfolio().profile
}

export function useNavigation() {
  return usePortfolio().navigation.filter(item => item.enabled !== false)
}

export function useSections() {
  return usePortfolio().sections
}

export function useContact() {
  return usePortfolio().contact
}
