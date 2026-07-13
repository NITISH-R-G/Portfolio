import { portfolioData } from '../data/portfolio'

export function usePortfolio() {
  return portfolioData
}

export function useTheme() {
  return portfolioData.site.theme
}

export function useMotion() {
  return portfolioData.site.motion
}

export function useProfile() {
  return portfolioData.profile
}

export function useNavigation() {
  return portfolioData.navigation.filter(item => item.enabled !== false)
}

export function useSections() {
  return portfolioData.sections
}

export function useContact() {
  return portfolioData.contact
}