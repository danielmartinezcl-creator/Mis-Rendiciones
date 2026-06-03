'use server'

import Anthropic from '@anthropic-ai/sdk'
import { buildOcrPrompt, parseOcrResponse } from '@/lib/ocr-helpers'
import type { OcrResult } from '@/lib/ocr-helpers'

export type { OcrResult }

export async function runOcr(imageBase64: string, mimeType: string): Promise<OcrResult | null> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: buildOcrPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Extrae los datos de este documento.',
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseOcrResponse(text)
  } catch (error) {
    console.error('[OCR] Error llamando a Claude:', error)
    return null
  }
}
