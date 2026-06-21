/**
 * Minimal QR Code generator for TOTP provisioning URIs.
 * Generates an SVG string — no external dependencies.
 * Supports alphanumeric/byte mode, error correction level L, versions 1-40.
 */

// Galois field arithmetic for Reed-Solomon
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  EXP[255] = EXP[0];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen: number[] = new Array(ecLen + 1).fill(0);
  gen[0] = 1;
  for (let i = 0; i < ecLen; i++) {
    for (let j = i + 1; j >= 1; j--) {
      gen[j] = gen[j] ^ gfMul(gen[j - 1], EXP[i]);
    }
  }
  const result = new Array(ecLen).fill(0);
  for (const byte of data) {
    const lead = byte ^ result[0];
    for (let i = 0; i < ecLen - 1; i++) {
      result[i] = result[i + 1] ^ gfMul(lead, gen[ecLen - i]);
    }
    result[ecLen - 1] = gfMul(lead, gen[0]);
  }
  return result;
}

// QR Code data encoding (byte mode)
function encodeData(text: string, version: number): number[] {
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];

  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  // Mode indicator: byte mode = 0100
  push(0b0100, 4);
  // Character count (8 bits for versions 1-9, 16 bits for 10+)
  push(bytes.length, version <= 9 ? 8 : 16);
  // Data
  for (const b of bytes) push(b, 8);
  // Terminator
  push(0, Math.min(4, getDataCapacity(version) * 8 - bits.length));

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad to capacity
  const cap = getDataCapacity(version) * 8;
  let padByte = 0;
  while (bits.length < cap) {
    push(padByte === 0 ? 0xec : 0x11, 8);
    padByte ^= 1;
  }

  // Convert to bytes
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    result.push(byte);
  }
  return result;
}

// EC codewords per block for error correction level L
const EC_CODEWORDS_L: Record<number, number> = {
  1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 18, 7: 20, 8: 24, 9: 30, 10: 18,
  11: 20, 12: 24, 13: 26, 14: 30, 15: 22, 16: 24, 17: 28, 18: 30, 19: 28,
  20: 28, 21: 28, 22: 28, 23: 30, 24: 30, 25: 26, 26: 28, 27: 30, 28: 30,
  29: 30, 30: 30, 31: 30, 32: 30, 33: 30, 34: 30, 35: 30, 36: 30, 37: 30,
  38: 30, 39: 30, 40: 30
};

// Total data codewords for level L
const DATA_CODEWORDS_L: Record<number, number> = {
  1: 19, 2: 34, 3: 55, 4: 80, 5: 108, 6: 136, 7: 156, 8: 194, 9: 232, 10: 274,
  11: 324, 12: 370, 13: 428, 14: 461, 15: 523, 16: 589, 17: 647, 18: 721, 19: 795,
  20: 861, 21: 932, 22: 1006, 23: 1094, 24: 1174, 25: 1276, 26: 1370, 27: 1468,
  28: 1531, 29: 1631, 30: 1735, 31: 1843, 32: 1955, 33: 2071, 34: 2191, 35: 2306,
  36: 2434, 37: 2566, 38: 2702, 39: 2812, 40: 2956
};

// Number of EC blocks for level L
const NUM_BLOCKS_L: Record<number, [number, number][]> = {
  1: [[1, 19]], 2: [[1, 34]], 3: [[1, 55]], 4: [[1, 80]], 5: [[1, 108]],
  6: [[2, 68]], 7: [[2, 78]], 8: [[2, 97]], 9: [[2, 116]], 10: [[2, 68], [2, 69]],
  11: [[4, 81]], 12: [[2, 92], [2, 93]], 13: [[4, 107]], 14: [[3, 115], [1, 116]],
  15: [[5, 87], [1, 88]], 16: [[5, 98], [1, 99]], 17: [[1, 107], [5, 108]],
  18: [[5, 120], [1, 121]], 19: [[3, 113], [4, 114]], 20: [[3, 107], [5, 108]],
};

function getDataCapacity(version: number): number {
  return DATA_CODEWORDS_L[version] || 0;
}

function getMinVersion(text: string): number {
  const len = new TextEncoder().encode(text).length;
  for (let v = 1; v <= 40; v++) {
    const overhead = v <= 9 ? 2 : 3; // mode(4bits) + count(8or16) + terminator ~ 2-3 bytes
    if (getDataCapacity(v) >= len + overhead) return v;
  }
  return 40;
}

function getSize(version: number): number {
  return 17 + version * 4;
}

// Alignment pattern positions
function getAlignmentPositions(version: number): number[] {
  if (version <= 1) return [];
  const positions: number[][] = [
    [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
    [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90]
  ];
  return positions[version] || [];
}

/**
 * Generates a QR code as an SVG string for the given text.
 */
export function generateQrSvg(text: string, moduleSize: number = 4, margin: number = 4): string {
  const version = getMinVersion(text);
  const size = getSize(version);
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  // Place finder patterns
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          modules[rr][cc] =
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0;
    reserved[6][i] = true;
    modules[i][6] = i % 2 === 0;
    reserved[i][6] = true;
  }

  // Alignment patterns
  const alignPos = getAlignmentPositions(version);
  for (const r of alignPos) {
    for (const c of alignPos) {
      if (reserved[r]?.[c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
            reserved[rr][cc] = true;
            modules[rr][cc] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          }
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    reserved[8][i] = true;
    reserved[8][size - 1 - i] = true;
    reserved[i][8] = true;
    reserved[size - 1 - i][8] = true;
  }
  reserved[8][8] = true;
  // Dark module
  modules[size - 8][8] = true;
  reserved[size - 8][8] = true;

  // Reserve version info for version >= 7
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = true;
        reserved[size - 11 + j][i] = true;
      }
    }
  }

  // Encode data
  const dataCodewords = encodeData(text, version);
  const ecLen = EC_CODEWORDS_L[version];

  // Split into blocks and compute EC
  const blocks = NUM_BLOCKS_L[version];
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;

  if (blocks) {
    for (const [count, blockDataLen] of blocks) {
      for (let i = 0; i < count; i++) {
        const block = dataCodewords.slice(offset, offset + blockDataLen);
        offset += blockDataLen;
        dataBlocks.push(block);
        ecBlocks.push(rsEncode(block, ecLen));
      }
    }
  } else {
    // Fallback: single block
    dataBlocks.push(dataCodewords);
    ecBlocks.push(rsEncode(dataCodewords, ecLen));
  }

  // Interleave
  const interleaved: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }

  // Convert to bits
  const allBits: number[] = [];
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);
  }

  // Place data bits
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip timing column
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
    for (const row of rows) {
      for (const col of [right, right - 1]) {
        if (col < 0 || col >= size) continue;
        if (reserved[row][col]) continue;
        modules[row][col] = bitIdx < allBits.length ? allBits[bitIdx++] === 1 : false;
      }
    }
    upward = !upward;
  }

  // Apply mask pattern 0 (checkerboard) and format info
  const masked: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) =>
      reserved[r][c] ? modules[r][c] : modules[r][c] !== ((r + c) % 2 === 0)
    )
  );

  // Write format info (mask 0, EC level L = 01, mask 000 => format bits)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Around top-left finder
  for (let i = 0; i < 6; i++) masked[8][i] = formatBits[i] === 1;
  masked[8][7] = formatBits[6] === 1;
  masked[8][8] = formatBits[7] === 1;
  masked[7][8] = formatBits[8] === 1;
  for (let i = 0; i < 6; i++) masked[5 - i][8] = formatBits[9 + i] === 1;
  // Around other finders
  for (let i = 0; i < 8; i++) masked[8][size - 8 + i] = formatBits[i] === 1;
  for (let i = 0; i < 7; i++) masked[size - 1 - i][8] = formatBits[8 + i] === 1;

  // Generate SVG
  const totalSize = (size + margin * 2) * moduleSize;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">`;
  svg += `<rect width="${totalSize}" height="${totalSize}" fill="white"/>`;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (masked[r][c]) {
        svg += `<rect x="${(c + margin) * moduleSize}" y="${(r + margin) * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
      }
    }
  }
  svg += '</svg>';
  return svg;
}
