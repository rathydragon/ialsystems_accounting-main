import { CompressionResult } from '../types';

/**
 * Compresses any image (PNG, JPEG, HEIC converted) into modern WebP format
 * directly in the browser using HTML5 Canvas.
 * 
 * @param file The uploaded image File
 * @param maxDimension Maximum width/height in pixels (default: 1440px)
 * @param quality WebP compression quality from 0.0 to 1.0 (default: 0.8)
 */
export async function compressImageToWebP(
  file: File,
  maxDimension = 1440,
  quality = 0.82
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Uploaded file is not a valid image format.'));
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio preserving downscale
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get 2D canvas context.'));
        }

        // Crisp image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP
        let webpDataUrl = canvas.toDataURL('image/webp', quality);

        // Fallback check if browser returned JPEG
        if (!webpDataUrl.startsWith('data:image/webp')) {
          webpDataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const originalSizeKB = Math.round(file.size / 1024);

        // Approximate byte length from base64 string
        const base64Index = webpDataUrl.indexOf(';base64,');
        const rawBase64 = base64Index !== -1 ? webpDataUrl.substring(base64Index + 8) : webpDataUrl;
        const compressedBytes = Math.round((rawBase64.length * 3) / 4);
        const compressedSizeKB = Math.max(1, Math.round(compressedBytes / 1024));

        const savingsPercentage = originalSizeKB > 0 
          ? Math.max(0, Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100))
          : 0;

        resolve({
          dataUrl: webpDataUrl,
          originalSizeKB,
          compressedSizeKB,
          savingsPercentage,
          width,
          height
        });
      };

      img.onerror = () => {
        reject(new Error('Could not render the image file on canvas.'));
      };

      if (typeof e.target?.result === 'string') {
        img.src = e.target.result;
      } else {
        reject(new Error('Failed to read image data as string.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('File reader encountered an error while reading the receipt.'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Format currency amount with symbol and appropriate decimals
 */
export function formatCurrency(amount: number, currency: 'USD' | 'KHR'): string {
  if (currency === 'KHR') {
    return `៛ ${Math.round(amount).toLocaleString('en-US')}`;
  }
  return `$ ${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
