// Code 128 barcode encoder (no library). Produces bar widths and an SVG string.
// Uses code set C for numbers (shorter bars) and code set B for everything else.

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const CODE_C = 99;
const CODE_B = 100;
const STOP = 106;

/** Text Code 128 (set B) can hold: printable ASCII only. */
export const isCode128Encodable = (text: string) => text.length > 0 && /^[\x20-\x7E]+$/.test(text);

/** Symbol values (start … check digit, stop) for the given text. */
export function code128Values(text: string): number[] {
  if (!isCode128Encodable(text)) throw new Error('Barcode មានតែអក្សរ/លេខ ASCII ប៉ុណ្ណោះ');
  const values: number[] = [];
  const isDigits = (s: string) => /^\d+$/.test(s);

  if (isDigits(text) && text.length >= 4) {
    let rest = text;
    if (rest.length % 2 === 1) {
      // Odd number of digits: first digit in set B, then switch to set C.
      values.push(START_B, rest.charCodeAt(0) - 32, CODE_C);
      rest = rest.slice(1);
    } else {
      values.push(START_C);
    }
    for (let i = 0; i < rest.length; i += 2) values.push(Number(rest.slice(i, i + 2)));
  } else {
    values.push(START_B);
    let i = 0;
    while (i < text.length) {
      // Long run of digits inside text: pack it in set C.
      const run = /^\d+/.exec(text.slice(i))?.[0] || '';
      if (run.length >= 6) {
        const even = run.length - (run.length % 2);
        values.push(CODE_C);
        for (let j = 0; j < even; j += 2) values.push(Number(run.slice(j, j + 2)));
        values.push(CODE_B);
        i += even;
        continue;
      }
      values.push(text.charCodeAt(i) - 32);
      i += 1;
    }
    // Drop a trailing switch back to B with nothing after it.
    if (values[values.length - 1] === CODE_B) values.pop();
  }

  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, STOP);
  return values;
}

/** Alternating bar/space widths in modules, starting with a bar. */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap(v => PATTERNS[v].split('').map(Number));
}

/** SVG markup of the bars only (scales to its container). */
export function code128Svg(text: string, opts: { height?: number; quiet?: number; color?: string } = {}): string {
  const widths = code128Widths(text);
  const quiet = opts.quiet ?? 10;
  const height = opts.height ?? 60;
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  let rects = '';
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`;
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" fill="${opts.color || '#000'}" width="100%" height="100%">${rects}</svg>`;
}
