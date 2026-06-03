export function buildExchangeRateUrl(currency: string, date: string): string {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY!
  const [year, month, day] = date.split('-')
  return `https://v6.exchangerate-api.com/v6/${apiKey}/history/${currency}/${year}/${month}/${day}`
}

export function parseExchangeRateResponse(
  data: Record<string, unknown>,
  _fromCurrency: string
): number | null {
  if (data.result !== 'success') return null
  const rates = data.conversion_rates as Record<string, number>
  return rates?.CLP ?? null
}

export function convertToCLP(amount: number, rateToClp: number): number {
  return Math.round(amount * rateToClp)
}
