/**
 * Android resources.arsc Parser
 *
 * Parses the compiled resource table used in Android APK files.
 * The resource table maps resource IDs to their values (strings, dimensions, colors, etc.)
 *
 * Format: https://android.googlesource.com/platform/frameworks/base/+/master/libs/androidfw/include/androidfw/ResourceTypes.h
 */

// Chunk types
const RES_NULL_TYPE = 0x0000;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_TABLE_TYPE = 0x0002;
const RES_TABLE_PACKAGE_TYPE = 0x0200;
const RES_TABLE_TYPE_TYPE = 0x0201;
const RES_TABLE_TYPE_SPEC_TYPE = 0x0202;

// Value types
const TYPE_NULL = 0x00;
const TYPE_REFERENCE = 0x01;
const TYPE_ATTRIBUTE = 0x02;
const TYPE_STRING = 0x03;
const TYPE_FLOAT = 0x04;
const TYPE_DIMENSION = 0x05;
const TYPE_FRACTION = 0x06;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;
const TYPE_INT_COLOR_ARGB8 = 0x1c;
const TYPE_INT_COLOR_RGB8 = 0x1d;
const TYPE_INT_COLOR_ARGB4 = 0x1e;
const TYPE_INT_COLOR_RGB4 = 0x1f;

const DIMENSION_UNITS = ['px', 'dp', 'sp', 'pt', 'in', 'mm'];

// Resource type names
const RESOURCE_TYPE_NAMES: Record<number, string> = {};
// Common resource type names (populated from the type spec)

class ArscReader {
  private view: DataView;
  private data: Uint8Array;
  public pos: number;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    this.pos = 0;
  }

  get length(): number {
    return this.data.length;
  }

  readUint8(): number {
    return this.data[this.pos++];
  }

  readUint16(): number {
    const val = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return val;
  }

  seek(pos: number): void {
    this.pos = pos;
  }

  skip(bytes: number): void {
    this.pos += bytes;
  }
}

export interface ResourceEntry {
  id: string; // e.g., "0x7f010001"
  type: string; // e.g., "string", "drawable"
  name: string;
  value: string;
  valueType: number;
  config: string; // e.g., "default", "en-rUS"
}

export interface ResourcePackage {
  id: number;
  name: string;
  types: ResourceTypeInfo[];
}

export interface ResourceTypeInfo {
  id: number;
  name: string;
  entryCount: number;
  entries: ResourceEntry[];
}

export interface ResourceTable {
  packages: ResourcePackage[];
  stringPool: string[];
  entries: ResourceEntry[];
  stringResources: ResourceEntry[];
}

function readStringPool(reader: ArscReader, chunkStart: number): string[] {
  const headerSize = reader.readUint16();
  const chunkSize = reader.readUint32();
  const stringCount = reader.readUint32();
  const _styleCount = reader.readUint32();
  const flags = reader.readUint32();
  const stringsStart = reader.readUint32();
  const _stylesStart = reader.readUint32();

  const isUTF8 = (flags & (1 << 8)) !== 0;

  const offsets: number[] = [];
  for (let i = 0; i < stringCount; i++) {
    offsets.push(reader.readUint32());
  }

  const strings: string[] = [];
  const absoluteStringsStart = chunkStart + stringsStart;

  for (let i = 0; i < stringCount; i++) {
    const strOffset = absoluteStringsStart + offsets[i];
    const savedPos = reader.pos;
    reader.seek(strOffset);

    try {
      if (isUTF8) {
        let charCount = reader.readUint8();
        if ((charCount & 0x80) !== 0) {
          charCount = ((charCount & 0x7F) << 8) | reader.readUint8();
        }
        let byteCount = reader.readUint8();
        if ((byteCount & 0x80) !== 0) {
          byteCount = ((byteCount & 0x7F) << 8) | reader.readUint8();
        }
        if (byteCount > 0 && reader.pos + byteCount <= reader.length) {
          const bytes = new Uint8Array(reader.length);
          for (let j = 0; j < byteCount; j++) {
            bytes[j] = reader.readUint8();
          }
          strings.push(new TextDecoder('utf-8').decode(bytes.slice(0, byteCount)));
        } else {
          strings.push('');
        }
      } else {
        let charCount = reader.readUint16();
        if ((charCount & 0x8000) !== 0) {
          charCount = ((charCount & 0x7FFF) << 16) | reader.readUint16();
        }
        if (charCount > 0 && reader.pos + charCount * 2 <= reader.length) {
          const chars: number[] = [];
          for (let j = 0; j < charCount; j++) {
            chars.push(reader.readUint16());
          }
          strings.push(String.fromCharCode(...chars));
        } else {
          strings.push('');
        }
      }
    } catch {
      strings.push('');
    }

    reader.pos = savedPos;
  }

  // Seek to end of chunk
  reader.seek(chunkStart + chunkSize);

  return strings;
}

function formatValue(type: number, data: number, stringPool: string[]): string {
  switch (type) {
    case TYPE_NULL:
      return 'null';
    case TYPE_REFERENCE:
      return `@0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case TYPE_ATTRIBUTE:
      return `?0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case TYPE_STRING:
      return data >= 0 && data < stringPool.length ? stringPool[data] : `@string/${data}`;
    case TYPE_FLOAT: {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, data);
      return new DataView(buf).getFloat32(0).toString();
    }
    case TYPE_DIMENSION: {
      const value = complexToFloat(data);
      const unit = DIMENSION_UNITS[data & 0x0f] || '??';
      return `${value}${unit}`;
    }
    case TYPE_FRACTION: {
      const value = complexToFloat(data) * 100;
      const unit = (data & 0x0f) === 0 ? '%' : '%p';
      return `${value}${unit}`;
    }
    case TYPE_INT_DEC:
      return data.toString();
    case TYPE_INT_HEX:
      return `0x${(data >>> 0).toString(16)}`;
    case TYPE_INT_BOOLEAN:
      return data !== 0 ? 'true' : 'false';
    case TYPE_INT_COLOR_ARGB8:
    case TYPE_INT_COLOR_RGB8:
    case TYPE_INT_COLOR_ARGB4:
    case TYPE_INT_COLOR_RGB4:
      return `#${(data >>> 0).toString(16).padStart(8, '0')}`;
    default:
      return `0x${(data >>> 0).toString(16)}`;
  }
}

function complexToFloat(complex: number): number {
  const mantissa = (complex >> 8) & 0xffffff;
  const radix = (complex >> 4) & 0x03;
  const shifts = [0, 7, 15, 23];
  return mantissa * Math.pow(2, -shifts[radix]);
}

function readConfig(reader: ArscReader): string {
  const configSize = reader.readUint32();
  const configStart = reader.pos - 4;

  if (configSize < 28) {
    reader.seek(configStart + configSize);
    return 'default';
  }

  // Read relevant config fields
  reader.skip(4); // mcc, mnc
  const language1 = reader.readUint8();
  const language2 = reader.readUint8();
  const country1 = reader.readUint8();
  const country2 = reader.readUint8();

  // Skip rest of config
  reader.seek(configStart + configSize);

  const parts: string[] = [];
  if (language1 !== 0 && language2 !== 0) {
    parts.push(String.fromCharCode(language1, language2));
  }
  if (country1 !== 0 && country2 !== 0) {
    parts.push('r' + String.fromCharCode(country1, country2));
  }

  return parts.length > 0 ? parts.join('-') : 'default';
}

export function parseResourceTable(buffer: ArrayBuffer): ResourceTable {
  const reader = new ArscReader(buffer);

  // Read main header
  const mainType = reader.readUint16();
  const mainHeaderSize = reader.readUint16();
  const mainSize = reader.readUint32();

  if (mainType !== RES_TABLE_TYPE) {
    throw new Error(`Not a valid resources.arsc: type=0x${mainType.toString(16)}`);
  }

  const packageCount = reader.readUint32();

  // Read global string pool
  const globalPoolStart = reader.pos;
  const globalPoolType = reader.readUint16();
  let globalStringPool: string[] = [];

  if (globalPoolType === RES_STRING_POOL_TYPE) {
    globalStringPool = readStringPool(reader, globalPoolStart);
  }

  const packages: ResourcePackage[] = [];
  const allEntries: ResourceEntry[] = [];

  // Read packages
  for (let p = 0; p < packageCount && reader.pos < reader.length; p++) {
    const pkgStart = reader.pos;
    const pkgType = reader.readUint16();

    if (pkgType !== RES_TABLE_PACKAGE_TYPE) {
      // Try to skip to next valid chunk
      reader.skip(-2);
      break;
    }

    const pkgHeaderSize = reader.readUint16();
    const pkgSize = reader.readUint32();
    const pkgId = reader.readUint32();

    // Read package name (128 uint16 chars)
    const nameChars: number[] = [];
    for (let i = 0; i < 128; i++) {
      nameChars.push(reader.readUint16());
    }
    const pkgName = String.fromCharCode(...nameChars).replace(/\0.*$/, '');

    const typeStringsOffset = reader.readUint32();
    const _lastPublicType = reader.readUint32();
    const keyStringsOffset = reader.readUint32();
    const _lastPublicKey = reader.readUint32();

    // Read type string pool
    const typeStringsStart = pkgStart + typeStringsOffset;
    let typeStrings: string[] = [];
    if (typeStringsOffset > 0 && typeStringsStart < reader.length) {
      reader.seek(typeStringsStart);
      const tsType = reader.readUint16();
      if (tsType === RES_STRING_POOL_TYPE) {
        typeStrings = readStringPool(reader, typeStringsStart);
      }
    }

    // Read key string pool
    const keyStringsStart = pkgStart + keyStringsOffset;
    let keyStrings: string[] = [];
    if (keyStringsOffset > 0 && keyStringsStart < reader.length) {
      reader.seek(keyStringsStart);
      const ksType = reader.readUint16();
      if (ksType === RES_STRING_POOL_TYPE) {
        keyStrings = readStringPool(reader, keyStringsStart);
      }
    }

    const pkg: ResourcePackage = {
      id: pkgId,
      name: pkgName,
      types: [],
    };

    const pkgEnd = pkgStart + pkgSize;

    // Read type specs and types
    while (reader.pos < pkgEnd && reader.pos < reader.length - 4) {
      const chunkStart = reader.pos;
      const chunkType = reader.readUint16();
      const chunkHeaderSize = reader.readUint16();
      const chunkSize = reader.readUint32();

      if (chunkSize < 8 || chunkStart + chunkSize > reader.length) {
        reader.seek(pkgEnd);
        break;
      }

      switch (chunkType) {
        case RES_TABLE_TYPE_SPEC_TYPE: {
          const typeId = reader.readUint8();
          reader.skip(3); // res0, res1
          const entryCount = reader.readUint32();
          // Skip config flags
          reader.skip(entryCount * 4);
          break;
        }

        case RES_TABLE_TYPE_TYPE: {
          const typeId = reader.readUint8();
          reader.skip(3); // res0, res1
          const entryCount = reader.readUint32();
          const entriesStart = reader.readUint32();

          const typeName = typeId > 0 && typeId <= typeStrings.length
            ? typeStrings[typeId - 1] : `type_${typeId}`;

          const config = readConfig(reader);

          // Read entry offsets
          const entryOffsets: number[] = [];
          for (let i = 0; i < entryCount; i++) {
            entryOffsets.push(reader.readUint32());
          }

          const dataStart = chunkStart + entriesStart;

          for (let i = 0; i < entryCount; i++) {
            if (entryOffsets[i] === 0xFFFFFFFF) continue;

            reader.seek(dataStart + entryOffsets[i]);
            const entrySize = reader.readUint16();
            const entryFlags = reader.readUint16();
            const keyIndex = reader.readUint32();

            const entryName = keyIndex < keyStrings.length ? keyStrings[keyIndex] : `key_${keyIndex}`;
            const resourceId = (pkgId << 24) | (typeId << 16) | i;

            const isComplex = (entryFlags & 0x0001) !== 0;

            if (isComplex) {
              // Complex (bag) entry - skip for now
              const parentRef = reader.readUint32();
              const count = reader.readUint32();
              for (let j = 0; j < count; j++) {
                reader.skip(12); // name(4) + value(8)
              }
              const entry: ResourceEntry = {
                id: `0x${resourceId.toString(16).padStart(8, '0')}`,
                type: typeName,
                name: entryName,
                value: `(complex, ${count} entries)`,
                valueType: -1,
                config,
              };
              allEntries.push(entry);
            } else {
              // Simple entry
              const valueSize = reader.readUint16();
              const _valueRes0 = reader.readUint8();
              const valueType = reader.readUint8();
              const valueData = reader.readInt32();

              const value = formatValue(valueType, valueData, globalStringPool);

              const entry: ResourceEntry = {
                id: `0x${resourceId.toString(16).padStart(8, '0')}`,
                type: typeName,
                name: entryName,
                value,
                valueType,
                config,
              };
              allEntries.push(entry);
            }
          }

          break;
        }

        default:
          reader.seek(chunkStart + chunkSize);
          break;
      }

      // Ensure we don't go backwards
      if (reader.pos <= chunkStart) {
        reader.seek(chunkStart + chunkSize);
      }
    }

    packages.push(pkg);
    reader.seek(pkgEnd);
  }

  // Filter string resources
  const stringResources = allEntries.filter(e => e.type === 'string' && e.config === 'default');

  return {
    packages,
    stringPool: globalStringPool,
    entries: allEntries,
    stringResources,
  };
}
