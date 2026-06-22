import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedLabel } from './types';

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const client = new Anthropic();

const EXTRACTION_PROMPT = `Extract the following fields from this alcohol beverage label image. Return ONLY a valid JSON object — no markdown, no explanation.

For each field, return the exact text as it appears on the label (preserving capitalization and punctuation). Set "legible" to false and "value" to null if the field is not visible or cannot be read clearly.

{
  "brandName": { "value": "<exact text or null>", "legible": <true|false> },
  "classType": { "value": "<exact text or null>", "legible": <true|false> },
  "alcoholContent": { "value": "<exact text or null>", "legible": <true|false> },
  "netContents": { "value": "<exact text or null>", "legible": <true|false> },
  "governmentWarning": { "value": "<exact text or null>", "legible": <true|false> }
}

Do not judge, compare, or assess correctness. Extract only what you observe.`;

export async function extractLabel(
  imageBase64: string,
  mediaType: SupportedMediaType,
): Promise<ExtractedLabel> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]) as ExtractedLabel;
}
