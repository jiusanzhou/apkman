/**
 * APK Signature / Certificate Parser
 *
 * Parses PKCS#7 / X.509 certificates from APK META-INF/ directory.
 * Supports RSA, DSA, and EC certificates.
 *
 * This is a simplified ASN.1/DER parser that extracts the key certificate fields.
 */

export interface CertificateInfo {
  issuer: Record<string, string>;
  subject: Record<string, string>;
  serialNumber: string;
  validFrom: Date | null;
  validTo: Date | null;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize: number;
  fingerprints: {
    sha1: string;
    sha256: string;
    md5: string;
  };
  version: number;
  raw: Uint8Array;
}

export interface SignatureInfo {
  signatureScheme: string;
  certificates: CertificateInfo[];
  signerInfo: string;
}

// ASN.1 tag types
const ASN1_SEQUENCE = 0x30;
const ASN1_SET = 0x31;
const ASN1_INTEGER = 0x02;
const ASN1_BIT_STRING = 0x03;
const ASN1_OCTET_STRING = 0x04;
const ASN1_NULL = 0x05;
const ASN1_OID = 0x06;
const ASN1_UTF8STRING = 0x0c;
const ASN1_PRINTABLESTRING = 0x13;
const ASN1_T61STRING = 0x14;
const ASN1_IA5STRING = 0x16;
const ASN1_UTCTIME = 0x17;
const ASN1_GENERALIZEDTIME = 0x18;
const ASN1_BMPSTRING = 0x1e;
const ASN1_CONTEXT_0 = 0xa0;
const ASN1_CONTEXT_1 = 0xa1;
const ASN1_CONTEXT_3 = 0xa3;

// Well-known OIDs
const OID_MAP: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.5': 'serialNumber',
  '2.5.4.12': 'T',
  '2.5.4.42': 'GN',
  '2.5.4.4': 'SN',
  '2.5.4.46': 'dnQualifier',
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.4': 'MD5withRSA',
  '1.2.840.113549.1.1.5': 'SHA1withRSA',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10040.4.1': 'DSA',
  '1.2.840.10040.4.3': 'SHA1withDSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10045.4.3.2': 'SHA256withECDSA',
  '1.2.840.10045.4.3.3': 'SHA384withECDSA',
  '1.2.840.10045.4.3.4': 'SHA512withECDSA',
  '1.2.840.113549.1.7.1': 'data',
  '1.2.840.113549.1.7.2': 'signedData',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
};

interface ASN1Node {
  tag: number;
  constructed: boolean;
  length: number;
  data: Uint8Array;
  offset: number;
  headerLength: number;
  children?: ASN1Node[];
}

function parseASN1(data: Uint8Array, offset: number = 0): ASN1Node {
  if (offset >= data.length) {
    throw new Error('ASN1 parse error: offset beyond data');
  }

  const tag = data[offset];
  let pos = offset + 1;

  // Parse length
  let length: number;
  const firstLenByte = data[pos++];

  if (firstLenByte < 0x80) {
    length = firstLenByte;
  } else if (firstLenByte === 0x80) {
    // Indefinite length - not fully supported, estimate
    length = data.length - pos;
  } else {
    const numLenBytes = firstLenByte & 0x7f;
    length = 0;
    for (let i = 0; i < numLenBytes; i++) {
      length = (length << 8) | data[pos++];
    }
  }

  const headerLength = pos - offset;
  const nodeData = data.slice(pos, pos + length);

  const node: ASN1Node = {
    tag,
    constructed: (tag & 0x20) !== 0,
    length,
    data: nodeData,
    offset,
    headerLength,
  };

  // Parse children for constructed types
  if (node.constructed || tag === ASN1_SEQUENCE || tag === ASN1_SET ||
    tag === ASN1_CONTEXT_0 || tag === ASN1_CONTEXT_1 || tag === ASN1_CONTEXT_3) {
    node.children = [];
    let childOffset = 0;
    while (childOffset < nodeData.length) {
      try {
        const child = parseASN1(nodeData, childOffset);
        node.children.push(child);
        childOffset += child.headerLength + child.length;
      } catch {
        break;
      }
    }
  }

  return node;
}

function parseOID(data: Uint8Array): string {
  if (data.length === 0) return '';

  const parts: number[] = [];
  parts.push(Math.floor(data[0] / 40));
  parts.push(data[0] % 40);

  let value = 0;
  for (let i = 1; i < data.length; i++) {
    value = (value << 7) | (data[i] & 0x7f);
    if ((data[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }

  return parts.join('.');
}

function parseString(node: ASN1Node): string {
  switch (node.tag) {
    case ASN1_UTF8STRING:
    case ASN1_IA5STRING:
    case ASN1_PRINTABLESTRING:
    case ASN1_T61STRING:
      return new TextDecoder('utf-8').decode(node.data);
    case ASN1_BMPSTRING: {
      const chars: number[] = [];
      for (let i = 0; i < node.data.length; i += 2) {
        chars.push((node.data[i] << 8) | node.data[i + 1]);
      }
      return String.fromCharCode(...chars);
    }
    default:
      return new TextDecoder('utf-8').decode(node.data);
  }
}

function parseTime(node: ASN1Node): Date | null {
  try {
    const str = new TextDecoder('ascii').decode(node.data);
    if (node.tag === ASN1_UTCTIME) {
      // Format: YYMMDDHHMMSSZ
      let year = parseInt(str.substring(0, 2));
      year = year >= 50 ? 1900 + year : 2000 + year;
      const month = parseInt(str.substring(2, 4)) - 1;
      const day = parseInt(str.substring(4, 6));
      const hour = parseInt(str.substring(6, 8));
      const minute = parseInt(str.substring(8, 10));
      const second = parseInt(str.substring(10, 12));
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else if (node.tag === ASN1_GENERALIZEDTIME) {
      // Format: YYYYMMDDHHMMSSZ
      const year = parseInt(str.substring(0, 4));
      const month = parseInt(str.substring(4, 6)) - 1;
      const day = parseInt(str.substring(6, 8));
      const hour = parseInt(str.substring(8, 10));
      const minute = parseInt(str.substring(10, 12));
      const second = parseInt(str.substring(12, 14));
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
  } catch {
    return null;
  }
  return null;
}

function parseInteger(data: Uint8Array): string {
  if (data.length <= 8) {
    return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(':');
  }
  return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(':');
}

function parseDN(node: ASN1Node): Record<string, string> {
  const result: Record<string, string> = {};
  if (!node.children) return result;

  for (const rdnSet of node.children) {
    if (rdnSet.tag !== ASN1_SET || !rdnSet.children) continue;
    for (const rdnSeq of rdnSet.children) {
      if (rdnSeq.tag !== ASN1_SEQUENCE || !rdnSeq.children || rdnSeq.children.length < 2) continue;
      const oidNode = rdnSeq.children[0];
      const valueNode = rdnSeq.children[1];

      if (oidNode.tag === ASN1_OID) {
        const oid = parseOID(oidNode.data);
        const key = OID_MAP[oid] || oid;
        result[key] = parseString(valueNode);
      }
    }
  }

  return result;
}

function parseCertificate(certData: Uint8Array): CertificateInfo {
  const cert = parseASN1(certData);

  if (cert.tag !== ASN1_SEQUENCE || !cert.children || cert.children.length < 3) {
    throw new Error('Invalid certificate structure');
  }

  const tbsCertificate = cert.children[0];
  const signatureAlgorithm = cert.children[1];

  if (!tbsCertificate.children) {
    throw new Error('Invalid TBS certificate');
  }

  let idx = 0;
  let version = 1; // default v1

  // Check for explicit version tag [0]
  if (tbsCertificate.children[0]?.tag === ASN1_CONTEXT_0) {
    const versionNode = tbsCertificate.children[0];
    if (versionNode.children && versionNode.children[0]) {
      version = versionNode.children[0].data[0] + 1;
    }
    idx = 1;
  }

  const serialNumberNode = tbsCertificate.children[idx++];
  const _tbsSigAlg = tbsCertificate.children[idx++];
  const issuerNode = tbsCertificate.children[idx++];
  const validityNode = tbsCertificate.children[idx++];
  const subjectNode = tbsCertificate.children[idx++];
  const subjectPubKeyInfo = tbsCertificate.children[idx++];

  // Parse signature algorithm
  let sigAlgOID = '';
  if (signatureAlgorithm.children && signatureAlgorithm.children[0]) {
    sigAlgOID = parseOID(signatureAlgorithm.children[0].data);
  }

  // Parse public key info
  let pubKeyAlg = '';
  let pubKeySize = 0;
  if (subjectPubKeyInfo?.children && subjectPubKeyInfo.children.length >= 2) {
    const algId = subjectPubKeyInfo.children[0];
    if (algId.children && algId.children[0]) {
      pubKeyAlg = parseOID(algId.children[0].data);
    }
    const pubKeyBits = subjectPubKeyInfo.children[1];
    if (pubKeyBits.tag === ASN1_BIT_STRING) {
      pubKeySize = (pubKeyBits.data.length - 1) * 8; // subtract padding byte
    }
  }

  // Parse validity
  let validFrom: Date | null = null;
  let validTo: Date | null = null;
  if (validityNode?.children && validityNode.children.length >= 2) {
    validFrom = parseTime(validityNode.children[0]);
    validTo = parseTime(validityNode.children[1]);
  }

  return {
    version,
    issuer: parseDN(issuerNode),
    subject: parseDN(subjectNode),
    serialNumber: serialNumberNode ? parseInteger(serialNumberNode.data) : '',
    validFrom,
    validTo,
    signatureAlgorithm: OID_MAP[sigAlgOID] || sigAlgOID,
    publicKeyAlgorithm: OID_MAP[pubKeyAlg] || pubKeyAlg,
    publicKeySize: pubKeySize,
    fingerprints: { sha1: '', sha256: '', md5: '' }, // will be computed
    raw: certData,
  };
}

async function computeFingerprints(data: Uint8Array): Promise<{ sha1: string; sha256: string; md5: string }> {
  const sha1 = await crypto.subtle.digest('SHA-1', data.buffer as ArrayBuffer);
  const sha256 = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);

  // Simple MD5 implementation for fingerprint (crypto.subtle doesn't support MD5)
  const md5 = computeMD5(data);

  return {
    sha1: formatFingerprint(new Uint8Array(sha1)),
    sha256: formatFingerprint(new Uint8Array(sha256)),
    md5: formatFingerprint(md5),
  };
}

function formatFingerprint(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

// Minimal MD5 for fingerprint computation
function computeMD5(data: Uint8Array): Uint8Array {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function add32(a: number, b: number): number {
    return (a + b) & 0xFFFFFFFF;
  }

  const n = data.length;
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const state = [1732584193, -271733879, -1732584194, 271733878];

  let i: number;
  for (i = 64; i <= n; i += 64) {
    const blk: number[] = [];
    for (let j = 0; j < 16; j++) {
      const off = i - 64 + j * 4;
      blk[j] = data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | (data[off + 3] << 24);
    }
    md5cycle(state, blk);
  }

  for (let j = 0; j < 16; j++) tail[j] = 0;

  const remaining = n - (i - 64);
  for (let j = 0; j < remaining; j++) {
    tail[j >> 2] |= data[i - 64 + j] << ((j % 4) << 3);
  }
  tail[remaining >> 2] |= 0x80 << ((remaining % 4) << 3);

  if (remaining > 55) {
    md5cycle(state, tail);
    for (let j = 0; j < 16; j++) tail[j] = 0;
  }

  tail[14] = (n * 8) & 0xFFFFFFFF;
  tail[15] = Math.floor(n * 8 / 0x100000000);
  md5cycle(state, tail);

  const result = new Uint8Array(16);
  for (let j = 0; j < 4; j++) {
    result[j * 4] = state[j] & 0xFF;
    result[j * 4 + 1] = (state[j] >> 8) & 0xFF;
    result[j * 4 + 2] = (state[j] >> 16) & 0xFF;
    result[j * 4 + 3] = (state[j] >> 24) & 0xFF;
  }

  return result;
}

export async function parseSignature(
  certData: Uint8Array,
  fileName: string
): Promise<SignatureInfo> {
  let signatureScheme = 'v1 (JAR signing)';

  // Determine file type
  const ext = fileName.toLowerCase();
  if (ext.endsWith('.rsa') || ext.endsWith('.dsa') || ext.endsWith('.ec')) {
    // PKCS#7 signed data
    try {
      const root = parseASN1(certData);

      // Navigate PKCS#7 structure to find certificates
      let certificates: CertificateInfo[] = [];

      if (root.tag === ASN1_SEQUENCE && root.children) {
        // Check if this is PKCS#7 SignedData
        const contentType = root.children[0];
        if (contentType?.tag === ASN1_OID) {
          const oid = parseOID(contentType.data);
          if (oid === '1.2.840.113549.1.7.2') {
            // SignedData
            const content = root.children[1]; // [0] EXPLICIT
            if (content?.children && content.children[0]?.children) {
              const signedData = content.children[0];

              // Find certificates (context tag [0])
              for (const child of signedData.children!) {
                if (child.tag === ASN1_CONTEXT_0 && child.children) {
                  for (const certNode of child.children) {
                    try {
                      const certBytes = certData.slice(
                        certNode.offset,
                        certNode.offset + certNode.headerLength + certNode.length
                      );
                      const cert = parseCertificate(certBytes);
                      cert.fingerprints = await computeFingerprints(certBytes);
                      certificates.push(cert);
                    } catch {
                      // Skip invalid certificates
                    }
                  }
                }
              }
            }
          }
        }

        // If no certificates found through PKCS#7 structure, try direct X.509
        if (certificates.length === 0) {
          try {
            const cert = parseCertificate(certData);
            cert.fingerprints = await computeFingerprints(certData);
            certificates.push(cert);
          } catch {
            // Not a valid certificate either
          }
        }
      }

      return {
        signatureScheme,
        certificates,
        signerInfo: ext.endsWith('.rsa') ? 'RSA' : ext.endsWith('.dsa') ? 'DSA' : 'EC',
      };
    } catch (e) {
      return {
        signatureScheme,
        certificates: [],
        signerInfo: `Parse error: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  // For .SF or MANIFEST.MF files, return basic info
  return {
    signatureScheme,
    certificates: [],
    signerInfo: new TextDecoder('utf-8').decode(certData).substring(0, 500),
  };
}

/**
 * Detect APK signature scheme version by checking for v2/v3/v4 signature blocks
 */
export function detectSignatureScheme(apkBuffer: ArrayBuffer): string {
  const data = new Uint8Array(apkBuffer);
  const view = new DataView(apkBuffer);

  // Look for APK Signing Block before Central Directory
  // The APK Signing Block is located before the ZIP Central Directory
  // and contains v2/v3 signatures

  // Find End of Central Directory (EOCD)
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0 && i >= data.length - 65535 - 22; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return 'v1 (JAR signing)';

  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  // Check for APK Signing Block magic
  if (centralDirOffset >= 24) {
    try {
      // The APK Signing Block ends with:
      // - 8 bytes: block size
      // - 16 bytes: magic "APK Sig Block 42"
      const magicOffset = centralDirOffset - 16;
      if (magicOffset >= 8) {
        const magic = new TextDecoder('ascii').decode(data.slice(magicOffset, magicOffset + 16));
        if (magic === 'APK Sig Block 42') {
          // Check for v3 first (ID 0xf05368c0)
          // Then v2 (ID 0x7109871a)
          return 'v2+ (APK Signature Scheme)';
        }
      }
    } catch {
      // Ignore
    }
  }

  return 'v1 (JAR signing)';
}
