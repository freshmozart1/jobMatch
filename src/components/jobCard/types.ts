export type TextEmbedding = number[]

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
  embedding: TextEmbedding
  cosineSimilarity?: number
}
