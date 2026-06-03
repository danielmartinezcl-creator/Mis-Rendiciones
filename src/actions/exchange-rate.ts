'use server'

import { buildExchangeRateUrl, parseExchangeRateResponse } from '@/lib/exchange-rate-helpers'

export interface ExchangeRateResult {
  rate: number
  source: 'api' | 'manual'
  date: string
  currency: string
}

export async function getHistoricalRate(
  currency: string,
  date: string
): Promise<ExchangeRateResult | null> {
  if (currency === 'CLP') {
    return { rate: 1, source: 'api', date, currency }
  }

  try {
    const url = buildExchangeRateUrl(currency, date)
    const response = await fetch(url, {
      next: { revalidate: 86400 }, // cachear 24h — el TC histórico no cambia
    })

    if (!response.ok) {
      console.error(`[ExchangeRate] API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    const rate = parseExchangeRateResponse(data, currency)

    if (!rate) return null

    return { rate, source: 'api', date, currency }
  } catch (error) {
    console.error('[ExchangeRate] Error:', error)
    return null
  }
}
