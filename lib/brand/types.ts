export interface BrandConfig {
  brandId: string
  aliases: string[]
  displayName: string
  tagline: string
  categories: string[]
  themeColor: string
  accentColor: string
  logoUrl: string | null
  defaultQuery: string
  serviceMapping: Record<string, string>
  contextPrompt: string
  isActive: boolean
}

export interface BrandStageState {
  active: boolean
  brandId: string | null
  config: BrandConfig | null
}
