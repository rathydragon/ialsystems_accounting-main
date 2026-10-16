/**
 * Gemini AI Vision Service for Bank Slip Verification & OCR
 * Analyzes Cambodian bank receipts (ABA, Wing, ACLEDA, Canadia, TrueMoney, etc.)
 * and extracts the transaction amount and currency with high precision.
 */

export interface SlipOcrResult {
  success: boolean;
  amount?: number;
  currency?: 'USD' | 'KHR';
  bankName?: string;
  transactionId?: string;
  senderName?: string;
  receiverName?: string;
  rawResponse?: string;
  error?: string;
}

const STORAGE_KEY_GEMINI_KEY = 'ial_gemini_api_key';

/**
 * Get stored Gemini API key from localStorage or Vite environment variable
 */
export const getGeminiApiKey = (settingKey?: string): string => {
  if (settingKey && settingKey.trim()) return settingKey.trim();
  const fromStorage = localStorage.getItem(STORAGE_KEY_GEMINI_KEY);
  if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  const fromEnv = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || '';
  return fromEnv.trim();
};

/**
 * Save Gemini API Key to localStorage
 */
export const saveGeminiApiKey = (key: string): void => {
  if (key && key.trim()) {
    localStorage.setItem(STORAGE_KEY_GEMINI_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_KEY);
  }
};

/**
 * Call Gemini AI Vision to parse bank slip image
 */
export const extractBankSlipDataWithGemini = async (
  imageBase64: string,
  apiKey: string
): Promise<SlipOcrResult> => {
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      error: 'សូមបញ្ចូល Gemini API Key ដើម្បីស្កេនផ្ទៀងផ្ទាត់បង្កាន់ដៃ'
    };
  }

  try {
    // 1. Clean Base64 Data & extract mimeType
    let mimeType = 'image/jpeg';
    let rawBase64 = imageBase64;

    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      rawBase64 = dataUrlMatch[2];
    }

    const prompt = `You are an expert Cambodian bank slip and transaction receipt OCR parser.
Analyze this bank transaction receipt (ABA Bank, Wing Bank, ACLEDA, Canadia, TrueMoney, Bakong, etc.).
Extract the actual transaction/transferred amount and currency.
Carefully distinguish the main transaction amount from account balances, dates, phone numbers, or fees.

Return ONLY a pure JSON object:
{
  "amount": 501000,
  "currency": "KHR",
  "bankName": "ABA Bank",
  "transactionId": "optional transaction code",
  "receiverName": "optional receiver name"
}

Important Rules:
- "amount" MUST be a pure number without commas (e.g. 501000, 110.35, 15).
- If the slip has Cambodian Riel (៛, KHR, រៀល), "currency" MUST be "KHR".
- If the slip has US Dollars ($, USD, ដុល្លារ), "currency" MUST be "USD".
- "bankName" should be one of "ABA Bank", "Wing Bank", "ACLEDA", "Canadia", "TrueMoney", or "Other".
- "receiverName" MUST be the name of the beneficiary, receiving company, or account name that received the money (e.g. "BUYMED CAMBODIA", "BUYMED", or the recipient name printed on the receipt under "To", "ទៅកាន់", "ឈ្មោះគណនី", "Beneficiary", or "Account Name").`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: rawBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 600,
        responseMimeType: 'application/json'
      }
    };

    // Dynamically retrieve supported models for this specific API key to avoid 404 / unsupported errors
    let modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest'
    ];

    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
      const listRes = await fetch(listUrl);
      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData.models)) {
          const valid = listData.models
            .filter((m: any) =>
              Array.isArray(m.supportedGenerationMethods) &&
              m.supportedGenerationMethods.includes('generateContent')
            )
            .map((m: any) => String(m.name || '').replace(/^models\//, ''))
            .filter((name: string) => name && !name.includes('embedding') && !name.includes('imagen') && !name.includes('aqa'));

          if (valid.length > 0) {
            // Sort: flash models first, then latest models
            const sorted = valid.sort((a: string, b: string) => {
              const aFlash = a.includes('flash') ? -1 : 1;
              const bFlash = b.includes('flash') ? -1 : 1;
              if (aFlash !== bFlash) return aFlash - bFlash;
              return b.localeCompare(a);
            });
            modelsToTry = sorted;
          }
        }
      }
    } catch (e) {
      console.warn('Could not query ListModels, using fallback model list:', e);
    }

    let lastError = '';

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey.trim()
        )}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          lastError = errData?.error?.message || `HTTP ${response.status} ${response.statusText}`;
          console.warn(`Gemini model ${model} error:`, lastError);
          continue; // Try next available model
        }

        const data = await response.json();
        const textContent =
          data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        if (!textContent) {
          continue;
        }

        // Robust JSON extraction using regex
        let parsed: any = null;
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          const cleanedJson = textContent
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
          parsed = JSON.parse(cleanedJson);
        }

        if (!parsed) continue;

        let cleanAmount = typeof parsed.amount === 'number'
          ? parsed.amount
          : parseFloat(String(parsed.amount || '').replace(/,/g, '').replace(/[^0-9.]/g, ''));

        const curStr = String(parsed.currency || '').toUpperCase();
        const isKhr = curStr.includes('KHR') ||
          curStr.includes('៛') ||
          curStr.includes('RIEL') ||
          String(parsed.currency || '').includes('រៀល');

        const cleanCurrency: 'USD' | 'KHR' = isKhr ? 'KHR' : 'USD';

        const cleanReceiver = typeof parsed.receiverName === 'string' && parsed.receiverName.trim()
          ? parsed.receiverName.trim()
          : undefined;

        if (cleanAmount && !isNaN(cleanAmount) && cleanAmount > 0) {
          return {
            success: true,
            amount: cleanAmount,
            currency: cleanCurrency,
            bankName: parsed.bankName || 'ABA Bank',
            transactionId: parsed.transactionId,
            receiverName: cleanReceiver,
            rawResponse: textContent
          };
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    return {
      success: false,
      error: lastError || 'មិនអាចអានទិន្នន័យពី Slip បានទេ សូមពិនិត្យមើលភាពច្បាស់នៃរូបភាព'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'កំហុសបច្ចេកទេសក្នុងការភ្ជាប់ទៅកាន់ Gemini AI'
    };
  }
};
