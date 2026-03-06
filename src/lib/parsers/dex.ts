/**
 * DEX (Dalvik Executable) File Parser
 *
 * Parses classes.dex files to extract class definitions, methods,
 * and generates Smali disassembly output.
 *
 * DEX format reference: https://source.android.com/docs/core/runtime/dex-format
 */

// DEX magic bytes
const DEX_MAGIC = [0x64, 0x65, 0x78, 0x0a]; // "dex\n"

// Access flags
const ACC_PUBLIC = 0x0001;
const ACC_PRIVATE = 0x0002;
const ACC_PROTECTED = 0x0004;
const ACC_STATIC = 0x0008;
const ACC_FINAL = 0x0010;
const ACC_SYNCHRONIZED = 0x0020;
const ACC_VOLATILE = 0x0040;
const ACC_BRIDGE = 0x0040;
const ACC_TRANSIENT = 0x0080;
const ACC_VARARGS = 0x0080;
const ACC_NATIVE = 0x0100;
const ACC_INTERFACE = 0x0200;
const ACC_ABSTRACT = 0x0400;
const ACC_STRICT = 0x0800;
const ACC_SYNTHETIC = 0x1000;
const ACC_ANNOTATION = 0x2000;
const ACC_ENUM = 0x4000;
const ACC_CONSTRUCTOR = 0x10000;
const ACC_DECLARED_SYNCHRONIZED = 0x20000;

function accessFlagsToString(flags: number, isMethod: boolean): string {
  const parts: string[] = [];
  if (flags & ACC_PUBLIC) parts.push('public');
  if (flags & ACC_PRIVATE) parts.push('private');
  if (flags & ACC_PROTECTED) parts.push('protected');
  if (flags & ACC_STATIC) parts.push('static');
  if (flags & ACC_FINAL) parts.push('final');
  if (isMethod) {
    if (flags & ACC_SYNCHRONIZED) parts.push('synchronized');
    if (flags & ACC_BRIDGE) parts.push('bridge');
    if (flags & ACC_VARARGS) parts.push('varargs');
    if (flags & ACC_NATIVE) parts.push('native');
  } else {
    if (flags & ACC_VOLATILE) parts.push('volatile');
    if (flags & ACC_TRANSIENT) parts.push('transient');
  }
  if (flags & ACC_ABSTRACT) parts.push('abstract');
  if (flags & ACC_STRICT) parts.push('strictfp');
  if (flags & ACC_SYNTHETIC) parts.push('synthetic');
  if (flags & ACC_ENUM) parts.push('enum');
  if (flags & ACC_ANNOTATION) parts.push('annotation');
  if (flags & ACC_INTERFACE) parts.push('interface');
  if (isMethod && (flags & ACC_CONSTRUCTOR)) parts.push('constructor');
  if (isMethod && (flags & ACC_DECLARED_SYNCHRONIZED)) parts.push('declared-synchronized');
  return parts.join(' ');
}

class DexReader {
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

  readInt16(): number {
    const val = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readULEB128(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.data[this.pos++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }

  readSLEB128(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.data[this.pos++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    if (shift < 32 && (byte & 0x40)) {
      result |= -(1 << shift);
    }
    return result;
  }

  readMUTF8(offset: number): string {
    const savedPos = this.pos;
    this.pos = offset;

    // Read ULEB128 string length
    this.readULEB128();

    const chars: number[] = [];
    while (true) {
      const b = this.data[this.pos++];
      if (b === 0) break;
      if ((b & 0x80) === 0) {
        chars.push(b);
      } else if ((b & 0xe0) === 0xc0) {
        const b2 = this.data[this.pos++];
        chars.push(((b & 0x1f) << 6) | (b2 & 0x3f));
      } else if ((b & 0xf0) === 0xe0) {
        const b2 = this.data[this.pos++];
        const b3 = this.data[this.pos++];
        chars.push(((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      }
    }

    this.pos = savedPos;
    return String.fromCharCode(...chars);
  }

  seek(pos: number): void {
    this.pos = pos;
  }
}

// ============ Dalvik Opcodes ============

interface OpcodeInfo {
  name: string;
  format: string; // format identifier
}

const OPCODES: Record<number, OpcodeInfo> = {
  0x00: { name: 'nop', format: '10x' },
  0x01: { name: 'move', format: '12x' },
  0x02: { name: 'move/from16', format: '22x' },
  0x03: { name: 'move/16', format: '32x' },
  0x04: { name: 'move-wide', format: '12x' },
  0x05: { name: 'move-wide/from16', format: '22x' },
  0x06: { name: 'move-wide/16', format: '32x' },
  0x07: { name: 'move-object', format: '12x' },
  0x08: { name: 'move-object/from16', format: '22x' },
  0x09: { name: 'move-object/16', format: '32x' },
  0x0a: { name: 'move-result', format: '11x' },
  0x0b: { name: 'move-result-wide', format: '11x' },
  0x0c: { name: 'move-result-object', format: '11x' },
  0x0d: { name: 'move-exception', format: '11x' },
  0x0e: { name: 'return-void', format: '10x' },
  0x0f: { name: 'return', format: '11x' },
  0x10: { name: 'return-wide', format: '11x' },
  0x11: { name: 'return-object', format: '11x' },
  0x12: { name: 'const/4', format: '11n' },
  0x13: { name: 'const/16', format: '21s' },
  0x14: { name: 'const', format: '31i' },
  0x15: { name: 'const/high16', format: '21h' },
  0x16: { name: 'const-wide/16', format: '21s' },
  0x17: { name: 'const-wide/32', format: '31i' },
  0x18: { name: 'const-wide', format: '51l' },
  0x19: { name: 'const-wide/high16', format: '21h' },
  0x1a: { name: 'const-string', format: '21c_string' },
  0x1b: { name: 'const-string/jumbo', format: '31c_string' },
  0x1c: { name: 'const-class', format: '21c_type' },
  0x1d: { name: 'monitor-enter', format: '11x' },
  0x1e: { name: 'monitor-exit', format: '11x' },
  0x1f: { name: 'check-cast', format: '21c_type' },
  0x20: { name: 'instance-of', format: '22c_type' },
  0x21: { name: 'array-length', format: '12x' },
  0x22: { name: 'new-instance', format: '21c_type' },
  0x23: { name: 'new-array', format: '22c_type' },
  0x24: { name: 'filled-new-array', format: '35c_type' },
  0x25: { name: 'filled-new-array/range', format: '3rc_type' },
  0x26: { name: 'fill-array-data', format: '31t' },
  0x27: { name: 'throw', format: '11x' },
  0x28: { name: 'goto', format: '10t' },
  0x29: { name: 'goto/16', format: '20t' },
  0x2a: { name: 'goto/32', format: '30t' },
  0x2b: { name: 'packed-switch', format: '31t' },
  0x2c: { name: 'sparse-switch', format: '31t' },
  0x2d: { name: 'cmpl-float', format: '23x' },
  0x2e: { name: 'cmpg-float', format: '23x' },
  0x2f: { name: 'cmpl-double', format: '23x' },
  0x30: { name: 'cmpg-double', format: '23x' },
  0x31: { name: 'cmp-long', format: '23x' },
  0x32: { name: 'if-eq', format: '22t' },
  0x33: { name: 'if-ne', format: '22t' },
  0x34: { name: 'if-lt', format: '22t' },
  0x35: { name: 'if-ge', format: '22t' },
  0x36: { name: 'if-gt', format: '22t' },
  0x37: { name: 'if-le', format: '22t' },
  0x38: { name: 'if-eqz', format: '21t' },
  0x39: { name: 'if-nez', format: '21t' },
  0x3a: { name: 'if-ltz', format: '21t' },
  0x3b: { name: 'if-gez', format: '21t' },
  0x3c: { name: 'if-gtz', format: '21t' },
  0x3d: { name: 'if-lez', format: '21t' },
  // 3e-43 unused
  0x44: { name: 'aget', format: '23x' },
  0x45: { name: 'aget-wide', format: '23x' },
  0x46: { name: 'aget-object', format: '23x' },
  0x47: { name: 'aget-boolean', format: '23x' },
  0x48: { name: 'aget-byte', format: '23x' },
  0x49: { name: 'aget-char', format: '23x' },
  0x4a: { name: 'aget-short', format: '23x' },
  0x4b: { name: 'aput', format: '23x' },
  0x4c: { name: 'aput-wide', format: '23x' },
  0x4d: { name: 'aput-object', format: '23x' },
  0x4e: { name: 'aput-boolean', format: '23x' },
  0x4f: { name: 'aput-byte', format: '23x' },
  0x50: { name: 'aput-char', format: '23x' },
  0x51: { name: 'aput-short', format: '23x' },
  0x52: { name: 'iget', format: '22c_field' },
  0x53: { name: 'iget-wide', format: '22c_field' },
  0x54: { name: 'iget-object', format: '22c_field' },
  0x55: { name: 'iget-boolean', format: '22c_field' },
  0x56: { name: 'iget-byte', format: '22c_field' },
  0x57: { name: 'iget-char', format: '22c_field' },
  0x58: { name: 'iget-short', format: '22c_field' },
  0x59: { name: 'iput', format: '22c_field' },
  0x5a: { name: 'iput-wide', format: '22c_field' },
  0x5b: { name: 'iput-object', format: '22c_field' },
  0x5c: { name: 'iput-boolean', format: '22c_field' },
  0x5d: { name: 'iput-byte', format: '22c_field' },
  0x5e: { name: 'iput-char', format: '22c_field' },
  0x5f: { name: 'iput-short', format: '22c_field' },
  0x60: { name: 'sget', format: '21c_field' },
  0x61: { name: 'sget-wide', format: '21c_field' },
  0x62: { name: 'sget-object', format: '21c_field' },
  0x63: { name: 'sget-boolean', format: '21c_field' },
  0x64: { name: 'sget-byte', format: '21c_field' },
  0x65: { name: 'sget-char', format: '21c_field' },
  0x66: { name: 'sget-short', format: '21c_field' },
  0x67: { name: 'sput', format: '21c_field' },
  0x68: { name: 'sput-wide', format: '21c_field' },
  0x69: { name: 'sput-object', format: '21c_field' },
  0x6a: { name: 'sput-boolean', format: '21c_field' },
  0x6b: { name: 'sput-byte', format: '21c_field' },
  0x6c: { name: 'sput-char', format: '21c_field' },
  0x6d: { name: 'sput-short', format: '21c_field' },
  0x6e: { name: 'invoke-virtual', format: '35c_method' },
  0x6f: { name: 'invoke-super', format: '35c_method' },
  0x70: { name: 'invoke-direct', format: '35c_method' },
  0x71: { name: 'invoke-static', format: '35c_method' },
  0x72: { name: 'invoke-interface', format: '35c_method' },
  // 73 unused
  0x74: { name: 'invoke-virtual/range', format: '3rc_method' },
  0x75: { name: 'invoke-super/range', format: '3rc_method' },
  0x76: { name: 'invoke-direct/range', format: '3rc_method' },
  0x77: { name: 'invoke-static/range', format: '3rc_method' },
  0x78: { name: 'invoke-interface/range', format: '3rc_method' },
  // 79-7a unused
  0x7b: { name: 'neg-int', format: '12x' },
  0x7c: { name: 'not-int', format: '12x' },
  0x7d: { name: 'neg-long', format: '12x' },
  0x7e: { name: 'not-long', format: '12x' },
  0x7f: { name: 'neg-float', format: '12x' },
  0x80: { name: 'neg-double', format: '12x' },
  0x81: { name: 'int-to-long', format: '12x' },
  0x82: { name: 'int-to-float', format: '12x' },
  0x83: { name: 'int-to-double', format: '12x' },
  0x84: { name: 'long-to-int', format: '12x' },
  0x85: { name: 'long-to-float', format: '12x' },
  0x86: { name: 'long-to-double', format: '12x' },
  0x87: { name: 'float-to-int', format: '12x' },
  0x88: { name: 'float-to-long', format: '12x' },
  0x89: { name: 'float-to-double', format: '12x' },
  0x8a: { name: 'double-to-int', format: '12x' },
  0x8b: { name: 'double-to-long', format: '12x' },
  0x8c: { name: 'double-to-float', format: '12x' },
  0x8d: { name: 'int-to-byte', format: '12x' },
  0x8e: { name: 'int-to-char', format: '12x' },
  0x8f: { name: 'int-to-short', format: '12x' },
  0x90: { name: 'add-int', format: '23x' },
  0x91: { name: 'sub-int', format: '23x' },
  0x92: { name: 'mul-int', format: '23x' },
  0x93: { name: 'div-int', format: '23x' },
  0x94: { name: 'rem-int', format: '23x' },
  0x95: { name: 'and-int', format: '23x' },
  0x96: { name: 'or-int', format: '23x' },
  0x97: { name: 'xor-int', format: '23x' },
  0x98: { name: 'shl-int', format: '23x' },
  0x99: { name: 'shr-int', format: '23x' },
  0x9a: { name: 'ushr-int', format: '23x' },
  0x9b: { name: 'add-long', format: '23x' },
  0x9c: { name: 'sub-long', format: '23x' },
  0x9d: { name: 'mul-long', format: '23x' },
  0x9e: { name: 'div-long', format: '23x' },
  0x9f: { name: 'rem-long', format: '23x' },
  0xa0: { name: 'and-long', format: '23x' },
  0xa1: { name: 'or-long', format: '23x' },
  0xa2: { name: 'xor-long', format: '23x' },
  0xa3: { name: 'shl-long', format: '23x' },
  0xa4: { name: 'shr-long', format: '23x' },
  0xa5: { name: 'ushr-long', format: '23x' },
  0xa6: { name: 'add-float', format: '23x' },
  0xa7: { name: 'sub-float', format: '23x' },
  0xa8: { name: 'mul-float', format: '23x' },
  0xa9: { name: 'div-float', format: '23x' },
  0xaa: { name: 'rem-float', format: '23x' },
  0xab: { name: 'add-double', format: '23x' },
  0xac: { name: 'sub-double', format: '23x' },
  0xad: { name: 'mul-double', format: '23x' },
  0xae: { name: 'div-double', format: '23x' },
  0xaf: { name: 'rem-double', format: '23x' },
  0xb0: { name: 'add-int/2addr', format: '12x' },
  0xb1: { name: 'sub-int/2addr', format: '12x' },
  0xb2: { name: 'mul-int/2addr', format: '12x' },
  0xb3: { name: 'div-int/2addr', format: '12x' },
  0xb4: { name: 'rem-int/2addr', format: '12x' },
  0xb5: { name: 'and-int/2addr', format: '12x' },
  0xb6: { name: 'or-int/2addr', format: '12x' },
  0xb7: { name: 'xor-int/2addr', format: '12x' },
  0xb8: { name: 'shl-int/2addr', format: '12x' },
  0xb9: { name: 'shr-int/2addr', format: '12x' },
  0xba: { name: 'ushr-int/2addr', format: '12x' },
  0xbb: { name: 'add-long/2addr', format: '12x' },
  0xbc: { name: 'sub-long/2addr', format: '12x' },
  0xbd: { name: 'mul-long/2addr', format: '12x' },
  0xbe: { name: 'div-long/2addr', format: '12x' },
  0xbf: { name: 'rem-long/2addr', format: '12x' },
  0xc0: { name: 'and-long/2addr', format: '12x' },
  0xc1: { name: 'or-long/2addr', format: '12x' },
  0xc2: { name: 'xor-long/2addr', format: '12x' },
  0xc3: { name: 'shl-long/2addr', format: '12x' },
  0xc4: { name: 'shr-long/2addr', format: '12x' },
  0xc5: { name: 'ushr-long/2addr', format: '12x' },
  0xc6: { name: 'add-float/2addr', format: '12x' },
  0xc7: { name: 'sub-float/2addr', format: '12x' },
  0xc8: { name: 'mul-float/2addr', format: '12x' },
  0xc9: { name: 'div-float/2addr', format: '12x' },
  0xca: { name: 'rem-float/2addr', format: '12x' },
  0xcb: { name: 'add-double/2addr', format: '12x' },
  0xcc: { name: 'sub-double/2addr', format: '12x' },
  0xcd: { name: 'mul-double/2addr', format: '12x' },
  0xce: { name: 'div-double/2addr', format: '12x' },
  0xcf: { name: 'rem-double/2addr', format: '12x' },
  0xd0: { name: 'add-int/lit16', format: '22s' },
  0xd1: { name: 'rsub-int', format: '22s' },
  0xd2: { name: 'mul-int/lit16', format: '22s' },
  0xd3: { name: 'div-int/lit16', format: '22s' },
  0xd4: { name: 'rem-int/lit16', format: '22s' },
  0xd5: { name: 'and-int/lit16', format: '22s' },
  0xd6: { name: 'or-int/lit16', format: '22s' },
  0xd7: { name: 'xor-int/lit16', format: '22s' },
  0xd8: { name: 'add-int/lit8', format: '22b' },
  0xd9: { name: 'rsub-int/lit8', format: '22b' },
  0xda: { name: 'mul-int/lit8', format: '22b' },
  0xdb: { name: 'div-int/lit8', format: '22b' },
  0xdc: { name: 'rem-int/lit8', format: '22b' },
  0xdd: { name: 'and-int/lit8', format: '22b' },
  0xde: { name: 'or-int/lit8', format: '22b' },
  0xdf: { name: 'xor-int/lit8', format: '22b' },
  0xe0: { name: 'shl-int/lit8', format: '22b' },
  0xe1: { name: 'shr-int/lit8', format: '22b' },
  0xe2: { name: 'ushr-int/lit8', format: '22b' },
};

// ============ Types ============

export interface DexHeader {
  magic: string;
  version: string;
  checksum: number;
  fileSize: number;
  headerSize: number;
  endianTag: number;
  stringIdsSize: number;
  stringIdsOff: number;
  typeIdsSize: number;
  typeIdsOff: number;
  protoIdsSize: number;
  protoIdsOff: number;
  fieldIdsSize: number;
  fieldIdsOff: number;
  methodIdsSize: number;
  methodIdsOff: number;
  classDefsSize: number;
  classDefsOff: number;
  dataSize: number;
  dataOff: number;
}

export interface DexField {
  classType: string;
  type: string;
  name: string;
  accessFlags: number;
  accessFlagsStr: string;
}

export interface DexMethod {
  classType: string;
  returnType: string;
  name: string;
  parameterTypes: string[];
  accessFlags: number;
  accessFlagsStr: string;
  codeOffset: number;
  registersSize: number;
  insSize: number;
  outsSize: number;
  smaliCode: string;
  protoIdx: number;
}

export interface DexClassDef {
  className: string;
  accessFlags: number;
  accessFlagsStr: string;
  superclass: string;
  interfaces: string[];
  sourceFile: string;
  staticFields: DexField[];
  instanceFields: DexField[];
  directMethods: DexMethod[];
  virtualMethods: DexMethod[];
  smali: string;
}

export interface DexFile {
  header: DexHeader;
  strings: string[];
  types: string[];
  classes: DexClassDef[];
  classCount: number;
  methodCount: number;
  fieldCount: number;
}

// ============ Parser ============

export function parseDex(buffer: ArrayBuffer): DexFile {
  const reader = new DexReader(buffer);

  // Read header
  const header = readHeader(reader);

  // Read string IDs
  const strings = readStringIds(reader, header);

  // Read type IDs
  const types = readTypeIds(reader, header, strings);

  // Read proto IDs
  const protos = readProtoIds(reader, header, strings, types);

  // Read field IDs
  const fields = readFieldIds(reader, header, strings, types);

  // Read method IDs
  const methods = readMethodIds(reader, header, strings, types, protos);

  // Read class defs
  const classes = readClassDefs(reader, header, strings, types, protos, fields, methods);

  return {
    header,
    strings,
    types,
    classes,
    classCount: header.classDefsSize,
    methodCount: header.methodIdsSize,
    fieldCount: header.fieldIdsSize,
  };
}

function readHeader(reader: DexReader): DexHeader {
  reader.seek(0);

  const magic: number[] = [];
  for (let i = 0; i < 4; i++) magic.push(reader.readUint8());

  const version: number[] = [];
  for (let i = 0; i < 4; i++) version.push(reader.readUint8());

  const versionStr = String.fromCharCode(...version.slice(0, 3));
  const checksum = reader.readUint32();
  reader.pos += 20; // skip SHA-1 signature
  const fileSize = reader.readUint32();
  const headerSize = reader.readUint32();
  const endianTag = reader.readUint32();
  reader.pos += 8; // link_size, link_off
  reader.pos += 4; // map_off
  const stringIdsSize = reader.readUint32();
  const stringIdsOff = reader.readUint32();
  const typeIdsSize = reader.readUint32();
  const typeIdsOff = reader.readUint32();
  const protoIdsSize = reader.readUint32();
  const protoIdsOff = reader.readUint32();
  const fieldIdsSize = reader.readUint32();
  const fieldIdsOff = reader.readUint32();
  const methodIdsSize = reader.readUint32();
  const methodIdsOff = reader.readUint32();
  const classDefsSize = reader.readUint32();
  const classDefsOff = reader.readUint32();
  const dataSize = reader.readUint32();
  const dataOff = reader.readUint32();

  return {
    magic: String.fromCharCode(...magic),
    version: versionStr,
    checksum,
    fileSize,
    headerSize,
    endianTag,
    stringIdsSize,
    stringIdsOff,
    typeIdsSize,
    typeIdsOff,
    protoIdsSize,
    protoIdsOff,
    fieldIdsSize,
    fieldIdsOff,
    methodIdsSize,
    methodIdsOff,
    classDefsSize,
    classDefsOff,
    dataSize,
    dataOff,
  };
}

function readStringIds(reader: DexReader, header: DexHeader): string[] {
  const strings: string[] = [];
  reader.seek(header.stringIdsOff);

  const offsets: number[] = [];
  for (let i = 0; i < header.stringIdsSize; i++) {
    offsets.push(reader.readUint32());
  }

  for (const offset of offsets) {
    strings.push(reader.readMUTF8(offset));
  }

  return strings;
}

function readTypeIds(reader: DexReader, header: DexHeader, strings: string[]): string[] {
  const types: string[] = [];
  reader.seek(header.typeIdsOff);

  for (let i = 0; i < header.typeIdsSize; i++) {
    const descriptorIdx = reader.readUint32();
    types.push(strings[descriptorIdx] || `type_${i}`);
  }

  return types;
}

interface ProtoId {
  shorty: string;
  returnType: string;
  parameterTypes: string[];
}

function readProtoIds(
  reader: DexReader,
  header: DexHeader,
  strings: string[],
  types: string[]
): ProtoId[] {
  const protos: ProtoId[] = [];
  reader.seek(header.protoIdsOff);

  for (let i = 0; i < header.protoIdsSize; i++) {
    const shortyIdx = reader.readUint32();
    const returnTypeIdx = reader.readUint32();
    const parametersOff = reader.readUint32();

    const parameterTypes: string[] = [];
    if (parametersOff !== 0) {
      const savedPos = reader.pos;
      reader.seek(parametersOff);
      const size = reader.readUint32();
      for (let j = 0; j < size; j++) {
        const typeIdx = reader.readUint16();
        parameterTypes.push(types[typeIdx] || `type_${typeIdx}`);
      }
      reader.pos = savedPos;
    }

    protos.push({
      shorty: strings[shortyIdx] || '',
      returnType: types[returnTypeIdx] || 'V',
      parameterTypes,
    });
  }

  return protos;
}

interface FieldId {
  classIdx: number;
  typeIdx: number;
  nameIdx: number;
}

function readFieldIds(
  reader: DexReader,
  header: DexHeader,
  _strings: string[],
  _types: string[]
): FieldId[] {
  const fields: FieldId[] = [];
  reader.seek(header.fieldIdsOff);

  for (let i = 0; i < header.fieldIdsSize; i++) {
    const classIdx = reader.readUint16();
    const typeIdx = reader.readUint16();
    const nameIdx = reader.readUint32();
    fields.push({ classIdx, typeIdx, nameIdx });
  }

  return fields;
}

interface MethodId {
  classIdx: number;
  protoIdx: number;
  nameIdx: number;
}

function readMethodIds(
  reader: DexReader,
  header: DexHeader,
  _strings: string[],
  _types: string[],
  _protos: ProtoId[]
): MethodId[] {
  const methods: MethodId[] = [];
  reader.seek(header.methodIdsOff);

  for (let i = 0; i < header.methodIdsSize; i++) {
    const classIdx = reader.readUint16();
    const protoIdx = reader.readUint16();
    const nameIdx = reader.readUint32();
    methods.push({ classIdx, protoIdx, nameIdx });
  }

  return methods;
}

function disassemble(
  reader: DexReader,
  codeOffset: number,
  strings: string[],
  types: string[],
  fieldIds: FieldId[],
  methodIds: MethodId[],
  protos: ProtoId[]
): { smali: string; registersSize: number; insSize: number; outsSize: number } {
  reader.seek(codeOffset);

  const registersSize = reader.readUint16();
  const insSize = reader.readUint16();
  const outsSize = reader.readUint16();
  const triesSize = reader.readUint16();
  const _debugInfoOff = reader.readUint32();
  const insnsSize = reader.readUint32();

  const lines: string[] = [];
  const codeStart = reader.pos;
  const codeEnd = codeStart + insnsSize * 2;

  while (reader.pos < codeEnd) {
    const instrOffset = (reader.pos - codeStart) / 2;
    const word = reader.readUint16();
    const opcode = word & 0xFF;
    const opcodeInfo = OPCODES[opcode];

    if (!opcodeInfo) {
      lines.push(`    .line ${instrOffset}: ${opHex(opcode)} ; unknown opcode`);
      continue;
    }

    const label = `    .line ${instrOffset}: `;
    const format = opcodeInfo.format;
    const name = opcodeInfo.name;

    try {
      switch (format) {
        case '10x':
          lines.push(`${label}${name}`);
          break;
        case '12x': {
          const a = (word >> 8) & 0x0F;
          const b = (word >> 12) & 0x0F;
          lines.push(`${label}${name} v${a}, v${b}`);
          break;
        }
        case '11n': {
          const a = (word >> 8) & 0x0F;
          let b = (word >> 12) & 0x0F;
          if (b & 0x8) b = b - 16; // sign extend
          lines.push(`${label}${name} v${a}, ${b}`);
          break;
        }
        case '11x': {
          const a = (word >> 8) & 0xFF;
          lines.push(`${label}${name} v${a}`);
          break;
        }
        case '10t': {
          let offset = (word >> 8) & 0xFF;
          if (offset & 0x80) offset = offset - 256;
          lines.push(`${label}${name} :goto_${instrOffset + offset}`);
          break;
        }
        case '20t': {
          const offset = signExtend16(reader.readUint16());
          lines.push(`${label}${name} :goto_${instrOffset + offset}`);
          break;
        }
        case '22x': {
          const a = (word >> 8) & 0xFF;
          const b = reader.readUint16();
          lines.push(`${label}${name} v${a}, v${b}`);
          break;
        }
        case '21s': {
          const a = (word >> 8) & 0xFF;
          const b = signExtend16(reader.readUint16());
          lines.push(`${label}${name} v${a}, ${b}`);
          break;
        }
        case '21h': {
          const a = (word >> 8) & 0xFF;
          const b = reader.readUint16();
          lines.push(`${label}${name} v${a}, 0x${b.toString(16)}`);
          break;
        }
        case '21c_string': {
          const a = (word >> 8) & 0xFF;
          const idx = reader.readUint16();
          const str = idx < strings.length ? strings[idx] : `string@${idx}`;
          lines.push(`${label}${name} v${a}, "${escapeStr(str)}"`);
          break;
        }
        case '31c_string': {
          const a = (word >> 8) & 0xFF;
          const idx = reader.readUint16() | (reader.readUint16() << 16);
          const str = idx < strings.length ? strings[idx] : `string@${idx}`;
          lines.push(`${label}${name} v${a}, "${escapeStr(str)}"`);
          break;
        }
        case '21c_type': {
          const a = (word >> 8) & 0xFF;
          const idx = reader.readUint16();
          const type = idx < types.length ? types[idx] : `type@${idx}`;
          lines.push(`${label}${name} v${a}, ${type}`);
          break;
        }
        case '21c_field': {
          const a = (word >> 8) & 0xFF;
          const idx = reader.readUint16();
          const fieldStr = resolveField(idx, fieldIds, strings, types);
          lines.push(`${label}${name} v${a}, ${fieldStr}`);
          break;
        }
        case '21t': {
          const a = (word >> 8) & 0xFF;
          const offset = signExtend16(reader.readUint16());
          lines.push(`${label}${name} v${a}, :cond_${instrOffset + offset}`);
          break;
        }
        case '22t': {
          const a = (word >> 8) & 0x0F;
          const b = (word >> 12) & 0x0F;
          const offset = signExtend16(reader.readUint16());
          lines.push(`${label}${name} v${a}, v${b}, :cond_${instrOffset + offset}`);
          break;
        }
        case '22s': {
          const a = (word >> 8) & 0x0F;
          const b = (word >> 12) & 0x0F;
          const lit = signExtend16(reader.readUint16());
          lines.push(`${label}${name} v${a}, v${b}, ${lit}`);
          break;
        }
        case '22b': {
          const a = (word >> 8) & 0xFF;
          const bb = reader.readUint16();
          const b = bb & 0xFF;
          let lit = (bb >> 8) & 0xFF;
          if (lit & 0x80) lit = lit - 256;
          lines.push(`${label}${name} v${a}, v${b}, ${lit}`);
          break;
        }
        case '22c_type': {
          const a = (word >> 8) & 0x0F;
          const b = (word >> 12) & 0x0F;
          const idx = reader.readUint16();
          const type = idx < types.length ? types[idx] : `type@${idx}`;
          lines.push(`${label}${name} v${a}, v${b}, ${type}`);
          break;
        }
        case '22c_field': {
          const a = (word >> 8) & 0x0F;
          const b = (word >> 12) & 0x0F;
          const idx = reader.readUint16();
          const fieldStr = resolveField(idx, fieldIds, strings, types);
          lines.push(`${label}${name} v${a}, v${b}, ${fieldStr}`);
          break;
        }
        case '23x': {
          const a = (word >> 8) & 0xFF;
          const bc = reader.readUint16();
          const b = bc & 0xFF;
          const c = (bc >> 8) & 0xFF;
          lines.push(`${label}${name} v${a}, v${b}, v${c}`);
          break;
        }
        case '30t': {
          const lo = reader.readUint16();
          const hi = reader.readUint16();
          const offset = lo | (hi << 16);
          lines.push(`${label}${name} :goto_${instrOffset + offset}`);
          break;
        }
        case '31i': {
          const a = (word >> 8) & 0xFF;
          const lo = reader.readUint16();
          const hi = reader.readUint16();
          const val = lo | (hi << 16);
          lines.push(`${label}${name} v${a}, 0x${(val >>> 0).toString(16)}`);
          break;
        }
        case '31t': {
          const a = (word >> 8) & 0xFF;
          const lo = reader.readUint16();
          const hi = reader.readUint16();
          const offset = lo | (hi << 16);
          lines.push(`${label}${name} v${a}, :data_${instrOffset + offset}`);
          break;
        }
        case '32x': {
          const a = reader.readUint16();
          const b = reader.readUint16();
          lines.push(`${label}${name} v${a}, v${b}`);
          break;
        }
        case '35c_type':
        case '35c_method': {
          const argCount = (word >> 12) & 0x0F;
          const idx = reader.readUint16();
          const regWord = reader.readUint16();
          const regs: number[] = [];
          if (argCount >= 1) regs.push(regWord & 0x0F);
          if (argCount >= 2) regs.push((regWord >> 4) & 0x0F);
          if (argCount >= 3) regs.push((regWord >> 8) & 0x0F);
          if (argCount >= 4) regs.push((regWord >> 12) & 0x0F);
          if (argCount >= 5) regs.push((word >> 8) & 0x0F);
          const regStr = regs.map(r => `v${r}`).join(', ');
          if (format.includes('method')) {
            const methodStr = resolveMethod(idx, methodIds, strings, types, protos);
            lines.push(`${label}${name} {${regStr}}, ${methodStr}`);
          } else {
            const type = idx < types.length ? types[idx] : `type@${idx}`;
            lines.push(`${label}${name} {${regStr}}, ${type}`);
          }
          break;
        }
        case '3rc_type':
        case '3rc_method': {
          const count = (word >> 8) & 0xFF;
          const idx = reader.readUint16();
          const startReg = reader.readUint16();
          const regStr = count > 0
            ? `v${startReg} .. v${startReg + count - 1}`
            : '';
          if (format.includes('method')) {
            const methodStr = resolveMethod(idx, methodIds, strings, types, protos);
            lines.push(`${label}${name} {${regStr}}, ${methodStr}`);
          } else {
            const type = idx < types.length ? types[idx] : `type@${idx}`;
            lines.push(`${label}${name} {${regStr}}, ${type}`);
          }
          break;
        }
        case '51l': {
          const a = (word >> 8) & 0xFF;
          const w1 = reader.readUint16();
          const w2 = reader.readUint16();
          const w3 = reader.readUint16();
          const w4 = reader.readUint16();
          lines.push(`${label}${name} v${a}, 0x${w4.toString(16)}${w3.toString(16)}${w2.toString(16)}${w1.toString(16)}`);
          break;
        }
        default:
          lines.push(`${label}${name} ; unhandled format ${format}`);
          break;
      }
    } catch {
      lines.push(`${label}${name} ; decode error`);
      break;
    }
  }

  // Skip try/catch handlers if present
  if (triesSize > 0 && insnsSize % 2 !== 0) {
    reader.readUint16(); // padding
  }

  return { smali: lines.join('\n'), registersSize, insSize, outsSize };
}

function signExtend16(value: number): number {
  if (value & 0x8000) return value - 0x10000;
  return value;
}

function opHex(opcode: number): string {
  return `0x${opcode.toString(16).padStart(2, '0')}`;
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function resolveField(idx: number, fieldIds: FieldId[], strings: string[], types: string[]): string {
  if (idx >= fieldIds.length) return `field@${idx}`;
  const f = fieldIds[idx];
  const cls = f.classIdx < types.length ? types[f.classIdx] : `type@${f.classIdx}`;
  const type = f.typeIdx < types.length ? types[f.typeIdx] : `type@${f.typeIdx}`;
  const name = f.nameIdx < strings.length ? strings[f.nameIdx] : `string@${f.nameIdx}`;
  return `${cls}->${name}:${type}`;
}

function resolveMethod(idx: number, methodIds: MethodId[], strings: string[], types: string[], protos: ProtoId[]): string {
  if (idx >= methodIds.length) return `method@${idx}`;
  const m = methodIds[idx];
  const cls = m.classIdx < types.length ? types[m.classIdx] : `type@${m.classIdx}`;
  const name = m.nameIdx < strings.length ? strings[m.nameIdx] : `string@${m.nameIdx}`;
  if (m.protoIdx < protos.length) {
    const proto = protos[m.protoIdx];
    const params = proto.parameterTypes.join('');
    return `${cls}->${name}(${params})${proto.returnType}`;
  }
  return `${cls}->${name}()V`;
}

function readClassDefs(
  reader: DexReader,
  header: DexHeader,
  strings: string[],
  types: string[],
  protos: ProtoId[],
  fieldIds: FieldId[],
  methodIds: MethodId[]
): DexClassDef[] {
  const classes: DexClassDef[] = [];
  reader.seek(header.classDefsOff);

  for (let i = 0; i < header.classDefsSize; i++) {
    const classIdx = reader.readUint32();
    const accessFlags = reader.readUint32();
    const superclassIdx = reader.readUint32();
    const interfacesOff = reader.readUint32();
    const sourceFileIdx = reader.readUint32();
    const _annotationsOff = reader.readUint32();
    const classDataOff = reader.readUint32();
    const _staticValuesOff = reader.readUint32();

    const className = classIdx < types.length ? types[classIdx] : `type_${classIdx}`;
    const superclass = superclassIdx !== 0xFFFFFFFF && superclassIdx < types.length
      ? types[superclassIdx] : '';
    const sourceFile = sourceFileIdx !== 0xFFFFFFFF && sourceFileIdx < strings.length
      ? strings[sourceFileIdx] : '';

    const interfaces: string[] = [];
    if (interfacesOff !== 0) {
      const savedPos = reader.pos;
      reader.seek(interfacesOff);
      const size = reader.readUint32();
      for (let j = 0; j < size; j++) {
        const typeIdx = reader.readUint16();
        interfaces.push(typeIdx < types.length ? types[typeIdx] : `type@${typeIdx}`);
      }
      reader.pos = savedPos;
    }

    const classDef: DexClassDef = {
      className,
      accessFlags,
      accessFlagsStr: accessFlagsToString(accessFlags, false),
      superclass,
      interfaces,
      sourceFile,
      staticFields: [],
      instanceFields: [],
      directMethods: [],
      virtualMethods: [],
      smali: '',
    };

    if (classDataOff !== 0) {
      const savedPos = reader.pos;
      reader.seek(classDataOff);

      const staticFieldsSize = reader.readULEB128();
      const instanceFieldsSize = reader.readULEB128();
      const directMethodsSize = reader.readULEB128();
      const virtualMethodsSize = reader.readULEB128();

      // Read static fields
      let fieldIdx = 0;
      for (let j = 0; j < staticFieldsSize; j++) {
        const fieldIdxDiff = reader.readULEB128();
        fieldIdx += fieldIdxDiff;
        const flags = reader.readULEB128();
        if (fieldIdx < fieldIds.length) {
          const f = fieldIds[fieldIdx];
          classDef.staticFields.push({
            classType: f.classIdx < types.length ? types[f.classIdx] : '',
            type: f.typeIdx < types.length ? types[f.typeIdx] : '',
            name: f.nameIdx < strings.length ? strings[f.nameIdx] : '',
            accessFlags: flags,
            accessFlagsStr: accessFlagsToString(flags, false),
          });
        }
      }

      // Read instance fields
      fieldIdx = 0;
      for (let j = 0; j < instanceFieldsSize; j++) {
        const fieldIdxDiff = reader.readULEB128();
        fieldIdx += fieldIdxDiff;
        const flags = reader.readULEB128();
        if (fieldIdx < fieldIds.length) {
          const f = fieldIds[fieldIdx];
          classDef.instanceFields.push({
            classType: f.classIdx < types.length ? types[f.classIdx] : '',
            type: f.typeIdx < types.length ? types[f.typeIdx] : '',
            name: f.nameIdx < strings.length ? strings[f.nameIdx] : '',
            accessFlags: flags,
            accessFlagsStr: accessFlagsToString(flags, false),
          });
        }
      }

      // Read direct methods
      let methodIdx = 0;
      for (let j = 0; j < directMethodsSize; j++) {
        const methodIdxDiff = reader.readULEB128();
        methodIdx += methodIdxDiff;
        const flags = reader.readULEB128();
        const codeOff = reader.readULEB128();

        const method = buildMethod(methodIdx, flags, codeOff, methodIds, strings, types, protos, reader, fieldIds);
        classDef.directMethods.push(method);
      }

      // Read virtual methods
      methodIdx = 0;
      for (let j = 0; j < virtualMethodsSize; j++) {
        const methodIdxDiff = reader.readULEB128();
        methodIdx += methodIdxDiff;
        const flags = reader.readULEB128();
        const codeOff = reader.readULEB128();

        const method = buildMethod(methodIdx, flags, codeOff, methodIds, strings, types, protos, reader, fieldIds);
        classDef.virtualMethods.push(method);
      }

      reader.pos = savedPos;
    }

    // Generate full smali representation
    classDef.smali = generateSmali(classDef);
    classes.push(classDef);
  }

  return classes;
}

function buildMethod(
  methodIdx: number,
  flags: number,
  codeOff: number,
  methodIds: MethodId[],
  strings: string[],
  types: string[],
  protos: ProtoId[],
  reader: DexReader,
  fieldIds: FieldId[]
): DexMethod {
  let classType = '';
  let name = '';
  let returnType = 'V';
  let parameterTypes: string[] = [];
  let protoIdx = 0;

  if (methodIdx < methodIds.length) {
    const m = methodIds[methodIdx];
    classType = m.classIdx < types.length ? types[m.classIdx] : '';
    name = m.nameIdx < strings.length ? strings[m.nameIdx] : `method_${methodIdx}`;
    protoIdx = m.protoIdx;
    if (m.protoIdx < protos.length) {
      returnType = protos[m.protoIdx].returnType;
      parameterTypes = protos[m.protoIdx].parameterTypes;
    }
  }

  let smaliCode = '';
  let registersSize = 0;
  let insSize = 0;
  let outsSize = 0;

  if (codeOff !== 0) {
    const savedPos = reader.pos;
    const result = disassemble(reader, codeOff, strings, types, fieldIds, methodIds, protos);
    smaliCode = result.smali;
    registersSize = result.registersSize;
    insSize = result.insSize;
    outsSize = result.outsSize;
    reader.pos = savedPos;
  }

  return {
    classType,
    returnType,
    name,
    parameterTypes,
    accessFlags: flags,
    accessFlagsStr: accessFlagsToString(flags, true),
    codeOffset: codeOff,
    registersSize,
    insSize,
    outsSize,
    smaliCode,
    protoIdx,
  };
}

function generateSmali(classDef: DexClassDef): string {
  const lines: string[] = [];

  lines.push(`.class ${classDef.accessFlagsStr} ${classDef.className}`);
  if (classDef.superclass) {
    lines.push(`.super ${classDef.superclass}`);
  }
  if (classDef.sourceFile) {
    lines.push(`.source "${classDef.sourceFile}"`);
  }
  for (const iface of classDef.interfaces) {
    lines.push(`.implements ${iface}`);
  }
  lines.push('');

  // Static fields
  for (const field of classDef.staticFields) {
    lines.push(`.field ${field.accessFlagsStr} ${field.name}:${field.type}`);
  }
  if (classDef.staticFields.length > 0) lines.push('');

  // Instance fields
  for (const field of classDef.instanceFields) {
    lines.push(`.field ${field.accessFlagsStr} ${field.name}:${field.type}`);
  }
  if (classDef.instanceFields.length > 0) lines.push('');

  // Direct methods
  for (const method of classDef.directMethods) {
    lines.push(`# direct methods`);
    lines.push(`.method ${method.accessFlagsStr} ${method.name}(${method.parameterTypes.join('')})${method.returnType}`);
    if (method.codeOffset !== 0) {
      lines.push(`    .registers ${method.registersSize}`);
      lines.push('');
      lines.push(method.smaliCode);
    }
    lines.push('.end method');
    lines.push('');
  }

  // Virtual methods
  for (const method of classDef.virtualMethods) {
    lines.push(`# virtual methods`);
    lines.push(`.method ${method.accessFlagsStr} ${method.name}(${method.parameterTypes.join('')})${method.returnType}`);
    if (method.codeOffset !== 0) {
      lines.push(`    .registers ${method.registersSize}`);
      lines.push('');
      lines.push(method.smaliCode);
    }
    lines.push('.end method');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert a DEX type descriptor to a human-readable Java type name
 * e.g., "Lcom/example/MyClass;" -> "com.example.MyClass"
 *       "I" -> "int"
 *       "[B" -> "byte[]"
 */
export function typeDescriptorToJava(descriptor: string): string {
  if (!descriptor) return descriptor;

  let arrayDims = 0;
  let i = 0;
  while (i < descriptor.length && descriptor[i] === '[') {
    arrayDims++;
    i++;
  }

  let baseType: string;
  const remaining = descriptor.substring(i);

  switch (remaining[0]) {
    case 'V': baseType = 'void'; break;
    case 'Z': baseType = 'boolean'; break;
    case 'B': baseType = 'byte'; break;
    case 'S': baseType = 'short'; break;
    case 'C': baseType = 'char'; break;
    case 'I': baseType = 'int'; break;
    case 'J': baseType = 'long'; break;
    case 'F': baseType = 'float'; break;
    case 'D': baseType = 'double'; break;
    case 'L':
      baseType = remaining.substring(1, remaining.length - 1).replace(/\//g, '.');
      break;
    default:
      baseType = descriptor;
  }

  return baseType + '[]'.repeat(arrayDims);
}
