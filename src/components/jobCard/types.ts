export type CompanyAddress = {
  streetAddress: string
  city: string
  postalCode: string
  countryCode: string
}

export type ScrapedJob = {
  sourceHostname: string
  sourceJobId?: string
  sourceUrl: string
  title: string
  company: string
  location?: string
  descriptionText?: string
  postedAt?: string
  scrapedAt: string
  tags?: string[]
  duplicateKey: string
  companyAddress: CompanyAddress
  embedding: number[]
  match?: number
}
