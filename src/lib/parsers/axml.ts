/**
 * Android Binary XML (AXML) Parser
 *
 * Parses the compiled binary XML format used in Android APK files
 * (AndroidManifest.xml and other resource XMLs).
 *
 * Binary XML format structure:
 * - Header (magic + file size)
 * - String Pool (all strings used in the XML)
 * - Resource ID Map (maps attribute names to resource IDs)
 * - XML Namespace Start/End
 * - XML Element Start/End with attributes
 */

// Chunk types
const CHUNK_AXML_FILE = 0x00080003;
const CHUNK_STRING_POOL = 0x001C0001;
const CHUNK_RESOURCE_IDS = 0x00080180;
const CHUNK_XML_START_NAMESPACE = 0x00100100;
const CHUNK_XML_END_NAMESPACE = 0x00100101;
const CHUNK_XML_START_ELEMENT = 0x00100102;
const CHUNK_XML_END_ELEMENT = 0x00100103;
const CHUNK_XML_CDATA = 0x00100104;

// Attribute value types
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
const FRACTION_UNITS = ['%', '%p'];

// Known Android resource attribute IDs
const ANDROID_ATTR_IDS: Record<number, string> = {
  0x01010000: 'theme',
  0x01010001: 'label',
  0x01010002: 'icon',
  0x01010003: 'name',
  0x01010006: 'permission',
  0x0101000e: 'protectionLevel',
  0x0101000f: 'description',
  0x01010010: 'process',
  0x01010011: 'taskAffinity',
  0x01010012: 'multiprocess',
  0x01010013: 'finishOnTaskLaunch',
  0x01010014: 'clearTaskOnLaunch',
  0x01010015: 'stateNotNeeded',
  0x01010016: 'excludeFromRecents',
  0x01010017: 'authorities',
  0x01010018: 'syncable',
  0x01010019: 'initOrder',
  0x0101001a: 'grantUriPermissions',
  0x0101001b: 'priority',
  0x0101001c: 'launchMode',
  0x0101001d: 'screenOrientation',
  0x0101001e: 'configChanges',
  0x0101001f: 'categories',
  0x01010020: 'data',
  0x01010024: 'targetPackage',
  0x01010025: 'handleProfiling',
  0x01010026: 'functionalTest',
  0x01010027: 'value',
  0x01010028: 'resource',
  0x0101002b: 'mimeType',
  0x0101002c: 'scheme',
  0x01010030: 'versionCode',
  0x01010031: 'versionName',
  0x01010032: 'sharedUserId',
  0x0101003e: 'exported',
  0x01010043: 'enabled',
  0x01010048: 'debuggable',
  0x0101004a: 'host',
  0x0101004b: 'port',
  0x0101004c: 'path',
  0x0101004d: 'pathPrefix',
  0x0101004e: 'pathPattern',
  0x0101006e: 'action',
  0x01010071: 'category',
  0x01010072: 'readPermission',
  0x01010073: 'writePermission',
  0x01010074: 'windowSoftInputMode',
  0x0101007a: 'immersive',
  0x01010092: 'hardwareAccelerated',
  0x010100a4: 'allowBackup',
  0x010100af: 'targetSdkVersion',
  0x010100d0: 'minSdkVersion',
  0x010100d1: 'maxSdkVersion',
  0x010100f2: 'installLocation',
  0x010100f4: 'compileSdkVersion',
  0x010100f6: 'supportsRtl',
  0x01010104: 'roundIcon',
  0x0101011f: 'compileSdkVersionCodename',
  0x01010200: 'appComponentFactory',
  0x01010281: 'networkSecurityConfig',
  0x010102b7: 'usesCleartextTraffic',
  0x01010398: 'requestLegacyExternalStorage',
  0x0101048c: 'dataExtractionRules',
  0x0101048d: 'fullBackupContent',
  0x010104ea: 'localeConfig',
  0x010104f5: 'enableOnBackInvokedCallback',
};

class BinaryReader {
  private view: DataView;
  private pos: number;
  private littleEndian: boolean;

  constructor(buffer: ArrayBuffer, offset = 0, littleEndian = true) {
    this.view = new DataView(buffer);
    this.pos = offset;
    this.littleEndian = littleEndian;
  }

  get position(): number {
    return this.pos;
  }

  set position(p: number) {
    this.pos = p;
  }

  get length(): number {
    return this.view.byteLength;
  }

  readUint8(): number {
    const val = this.view.getUint8(this.pos);
    this.pos += 1;
    return val;
  }

  readUint16(): number {
    const val = this.view.getUint16(this.pos, this.littleEndian);
    this.pos += 2;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.pos, this.littleEndian);
    this.pos += 4;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this.pos, this.littleEndian);
    this.pos += 4;
    return val;
  }

  readFloat32(): number {
    const val = this.view.getFloat32(this.pos, this.littleEndian);
    this.pos += 4;
    return val;
  }

  skip(bytes: number): void {
    this.pos += bytes;
  }

  slice(start: number, end: number): ArrayBuffer {
    return (this.view.buffer as ArrayBuffer).slice(start, end);
  }
}

export interface AXMLAttribute {
  namespace: string;
  name: string;
  value: string;
  rawValue: string;
  resourceId?: number;
}

export interface AXMLElement {
  tag: string;
  namespace: string;
  attributes: AXMLAttribute[];
  children: AXMLElement[];
}

export interface AXMLDocument {
  xml: string;
  rootElement: AXMLElement | null;
  namespaces: Record<string, string>;
}

function formatAttributeValue(
  type: number,
  data: number,
  rawString: string | null
): string {
  switch (type) {
    case TYPE_NULL:
      return '';
    case TYPE_REFERENCE:
      if (data === 0) return '@null';
      return `@0x${data.toString(16).padStart(8, '0')}`;
    case TYPE_ATTRIBUTE:
      return `?0x${data.toString(16).padStart(8, '0')}`;
    case TYPE_STRING:
      return rawString || '';
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
      const unit = FRACTION_UNITS[data & 0x0f] || '??';
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
      if (type >= 0x10 && type <= 0x1f) {
        return `0x${(data >>> 0).toString(16)}`;
      }
      return rawString || data.toString();
  }
}

function complexToFloat(complex: number): number {
  const mantissa = (complex >> 8) & 0xffffff;
  const radix = (complex >> 4) & 0x03;
  const shifts = [0, 7, 15, 23];
  return mantissa * Math.pow(2, -shifts[radix]);
}

export function parseAXML(buffer: ArrayBuffer): AXMLDocument {
  const reader = new BinaryReader(buffer);

  // Read file header
  const magic = reader.readUint32();
  if (magic !== CHUNK_AXML_FILE) {
    throw new Error(`Not a valid AXML file: magic=0x${magic.toString(16)}`);
  }
  const _fileSize = reader.readUint32();

  let stringPool: string[] = [];
  const resourceIds: number[] = [];
  const namespaces: Record<string, string> = {};
  const reverseNS: Record<string, string> = {};

  // Build XML
  const xmlParts: string[] = [];
  xmlParts.push('<?xml version="1.0" encoding="utf-8"?>');

  let indent = 0;
  const elementStack: AXMLElement[] = [];
  let rootElement: AXMLElement | null = null;
  let currentElement: AXMLElement | null = null;
  let pendingNamespaces: { prefix: string; uri: string }[] = [];

  while (reader.position < reader.length) {
    const chunkStart = reader.position;
    const chunkType = reader.readUint32();
    const chunkSize = reader.readUint32();

    if (chunkSize < 8) break;

    switch (chunkType) {
      case CHUNK_STRING_POOL: {
        reader.position = chunkStart + 8;
        stringPool = decodeStringPoolDirect(reader, chunkStart, chunkSize);
        reader.position = chunkStart + chunkSize;
        break;
      }

      case CHUNK_RESOURCE_IDS: {
        const count = (chunkSize - 8) / 4;
        for (let i = 0; i < count; i++) {
          resourceIds.push(reader.readUint32());
        }
        break;
      }

      case CHUNK_XML_START_NAMESPACE: {
        const _lineNumber = reader.readUint32();
        const _comment = reader.readUint32();
        const prefixIdx = reader.readInt32();
        const uriIdx = reader.readInt32();
        const prefix = prefixIdx >= 0 ? stringPool[prefixIdx] : '';
        const uri = uriIdx >= 0 ? stringPool[uriIdx] : '';
        namespaces[prefix] = uri;
        reverseNS[uri] = prefix;
        pendingNamespaces.push({ prefix, uri });
        break;
      }

      case CHUNK_XML_END_NAMESPACE: {
        reader.skip(chunkSize - 8);
        break;
      }

      case CHUNK_XML_START_ELEMENT: {
        const _lineNumber = reader.readUint32();
        const _comment = reader.readUint32();
        const nsIdx = reader.readInt32();
        const nameIdx = reader.readInt32();
        const _attrStart = reader.readUint16(); // attribute start
        const _attrSize = reader.readUint16(); // attribute size
        const attrCount = reader.readUint16();
        const _idIndex = reader.readUint16();
        const _classIndex = reader.readUint16();
        const _styleIndex = reader.readUint16();

        const tagName = nameIdx >= 0 ? stringPool[nameIdx] : '??';
        const ns = nsIdx >= 0 ? stringPool[nsIdx] : '';

        const element: AXMLElement = {
          tag: tagName,
          namespace: ns,
          attributes: [],
          children: [],
        };

        const attrs: string[] = [];
        for (let i = 0; i < attrCount; i++) {
          const attrNsIdx = reader.readInt32();
          const attrNameIdx = reader.readInt32();
          const attrValueStr = reader.readInt32();
          const attrType = reader.readUint16();
          const _attrUnk = reader.readUint16();
          const attrData = reader.readInt32();

          let attrNs = attrNsIdx >= 0 ? stringPool[attrNsIdx] : '';
          let attrName = attrNameIdx >= 0 ? stringPool[attrNameIdx] : '';

          // Try to resolve from resource IDs if name is empty or looks wrong
          if ((!attrName || attrName === '') && attrNameIdx >= 0 && attrNameIdx < resourceIds.length) {
            const resId = resourceIds[attrNameIdx];
            attrName = ANDROID_ATTR_IDS[resId] || `attr_0x${resId.toString(16)}`;
          }

          const rawValue = attrValueStr >= 0 ? stringPool[attrValueStr] : null;
          const formattedValue = formatAttributeValue(attrType >> 8 || attrType, attrData, rawValue);
          // Determine correct type byte - it's in the high byte of the combined field
          const typeByte = (attrType >> 8) & 0xFF;
          const value = formatAttributeValue(typeByte || TYPE_STRING, attrData, rawValue);

          const prefix = attrNs ? (reverseNS[attrNs] || '') : '';
          const qualifiedName = prefix ? `${prefix}:${attrName}` : attrName;

          element.attributes.push({
            namespace: attrNs,
            name: qualifiedName,
            value,
            rawValue: rawValue || '',
            resourceId: attrNameIdx < resourceIds.length ? resourceIds[attrNameIdx] : undefined,
          });

          attrs.push(`${qualifiedName}="${escapeXml(value)}"`);
        }

        // Add namespace declarations for pending namespaces
        for (const ns of pendingNamespaces) {
          const nsDecl = ns.prefix ? `xmlns:${ns.prefix}="${ns.uri}"` : `xmlns="${ns.uri}"`;
          attrs.unshift(nsDecl);
        }
        pendingNamespaces = [];

        const indentStr = '    '.repeat(indent);
        const attrStr = attrs.length > 0 ? ' ' + attrs.join('\n' + indentStr + '    ') : '';
        xmlParts.push(`${indentStr}<${tagName}${attrStr}>`);
        indent++;

        if (currentElement) {
          currentElement.children.push(element);
          elementStack.push(currentElement);
        } else {
          rootElement = element;
        }
        currentElement = element;
        break;
      }

      case CHUNK_XML_END_ELEMENT: {
        const _lineNumber = reader.readUint32();
        const _comment = reader.readUint32();
        const _nsIdx = reader.readInt32();
        const nameIdx = reader.readInt32();

        indent--;
        const tagName = nameIdx >= 0 ? stringPool[nameIdx] : '??';
        const indentStr = '    '.repeat(indent);
        xmlParts.push(`${indentStr}</${tagName}>`);

        currentElement = elementStack.pop() || null;
        break;
      }

      case CHUNK_XML_CDATA: {
        const _lineNumber = reader.readUint32();
        const _comment = reader.readUint32();
        const dataIdx = reader.readInt32();
        reader.skip(8); // typed value
        const text = dataIdx >= 0 ? stringPool[dataIdx] : '';
        const indentStr = '    '.repeat(indent);
        xmlParts.push(`${indentStr}${escapeXml(text)}`);
        break;
      }

      default:
        reader.position = chunkStart + chunkSize;
        break;
    }
  }

  return {
    xml: xmlParts.join('\n'),
    rootElement,
    namespaces,
  };
}

function decodeStringPoolDirect(reader: BinaryReader, chunkStart: number, chunkSize: number): string[] {
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
    const savedPos = reader.position;
    reader.position = strOffset;

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
        if (byteCount > 0 && reader.position + byteCount <= reader.length) {
          const bytes = new Uint8Array(reader.slice(reader.position, reader.position + byteCount));
          strings.push(new TextDecoder('utf-8').decode(bytes));
        } else {
          strings.push('');
        }
      } else {
        let charCount = reader.readUint16();
        if ((charCount & 0x8000) !== 0) {
          charCount = ((charCount & 0x7FFF) << 16) | reader.readUint16();
        }
        if (charCount > 0 && reader.position + charCount * 2 <= reader.length) {
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

    reader.position = savedPos;
  }

  return strings;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ========== AndroidManifest.xml high-level parser ==========

export interface ManifestPermission {
  name: string;
  description: string;
}

export interface ManifestComponent {
  type: 'activity' | 'service' | 'receiver' | 'provider';
  name: string;
  exported: boolean | null;
  permission: string;
  intentFilters: IntentFilter[];
}

export interface IntentFilter {
  actions: string[];
  categories: string[];
  data: { scheme?: string; host?: string; path?: string; mimeType?: string }[];
}

export interface ManifestInfo {
  packageName: string;
  versionCode: string;
  versionName: string;
  minSdkVersion: string;
  targetSdkVersion: string;
  compileSdkVersion: string;
  permissions: ManifestPermission[];
  usesFeatures: string[];
  activities: ManifestComponent[];
  services: ManifestComponent[];
  receivers: ManifestComponent[];
  providers: ManifestComponent[];
  application: {
    label: string;
    icon: string;
    debuggable: boolean;
    allowBackup: boolean;
    supportsRtl: boolean;
    theme: string;
  };
}

// Well-known Android permission descriptions
const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'android.permission.INTERNET': 'Full network access',
  'android.permission.ACCESS_NETWORK_STATE': 'View network connections',
  'android.permission.ACCESS_WIFI_STATE': 'View Wi-Fi connections',
  'android.permission.CAMERA': 'Take pictures and videos',
  'android.permission.READ_EXTERNAL_STORAGE': 'Read the contents of shared storage',
  'android.permission.WRITE_EXTERNAL_STORAGE': 'Modify or delete shared storage contents',
  'android.permission.READ_CONTACTS': 'Read your contacts',
  'android.permission.WRITE_CONTACTS': 'Modify your contacts',
  'android.permission.READ_PHONE_STATE': 'Read phone status and identity',
  'android.permission.CALL_PHONE': 'Directly call phone numbers',
  'android.permission.SEND_SMS': 'Send and view SMS messages',
  'android.permission.RECEIVE_SMS': 'Receive text messages',
  'android.permission.ACCESS_FINE_LOCATION': 'Access precise location (GPS)',
  'android.permission.ACCESS_COARSE_LOCATION': 'Access approximate location (network-based)',
  'android.permission.RECORD_AUDIO': 'Record audio',
  'android.permission.VIBRATE': 'Control vibration',
  'android.permission.WAKE_LOCK': 'Prevent phone from sleeping',
  'android.permission.RECEIVE_BOOT_COMPLETED': 'Run at startup',
  'android.permission.FOREGROUND_SERVICE': 'Run foreground service',
  'android.permission.READ_MEDIA_IMAGES': 'Read images from shared storage',
  'android.permission.READ_MEDIA_VIDEO': 'Read video from shared storage',
  'android.permission.READ_MEDIA_AUDIO': 'Read audio from shared storage',
  'android.permission.POST_NOTIFICATIONS': 'Post notifications',
  'android.permission.BLUETOOTH': 'Pair with Bluetooth devices',
  'android.permission.BLUETOOTH_ADMIN': 'Access Bluetooth settings',
  'android.permission.BLUETOOTH_CONNECT': 'Connect to paired Bluetooth devices',
  'android.permission.BLUETOOTH_SCAN': 'Discover and pair nearby Bluetooth devices',
  'android.permission.NFC': 'Control Near Field Communication',
  'android.permission.USE_FINGERPRINT': 'Use fingerprint hardware',
  'android.permission.USE_BIOMETRIC': 'Use biometric hardware',
  'android.permission.SYSTEM_ALERT_WINDOW': 'Display over other apps',
  'android.permission.REQUEST_INSTALL_PACKAGES': 'Request install packages',
  'android.permission.MANAGE_EXTERNAL_STORAGE': 'Access all files on device',
  'android.permission.SCHEDULE_EXACT_ALARM': 'Set exact alarms',
  'android.permission.ACCESS_BACKGROUND_LOCATION': 'Access location in background',
  'android.permission.BODY_SENSORS': 'Access body sensors',
  'android.permission.ACTIVITY_RECOGNITION': 'Recognize physical activity',
  'android.permission.READ_CALENDAR': 'Read calendar events',
  'android.permission.WRITE_CALENDAR': 'Add or modify calendar events',
  'android.permission.GET_ACCOUNTS': 'Find accounts on the device',
  'android.permission.CHANGE_WIFI_STATE': 'Connect and disconnect from Wi-Fi',
  'android.permission.CHANGE_NETWORK_STATE': 'Change network connectivity',
};

function getAttr(element: AXMLElement, name: string): string | undefined {
  const attr = element.attributes.find(a => {
    const attrName = a.name.includes(':') ? a.name.split(':')[1] : a.name;
    return attrName === name;
  });
  return attr?.value;
}

function parseIntentFilters(element: AXMLElement): IntentFilter[] {
  const filters: IntentFilter[] = [];
  for (const child of element.children) {
    if (child.tag === 'intent-filter') {
      const filter: IntentFilter = { actions: [], categories: [], data: [] };
      for (const fc of child.children) {
        if (fc.tag === 'action') {
          const name = getAttr(fc, 'name');
          if (name) filter.actions.push(name);
        } else if (fc.tag === 'category') {
          const name = getAttr(fc, 'name');
          if (name) filter.categories.push(name);
        } else if (fc.tag === 'data') {
          filter.data.push({
            scheme: getAttr(fc, 'scheme'),
            host: getAttr(fc, 'host'),
            path: getAttr(fc, 'path') || getAttr(fc, 'pathPrefix') || getAttr(fc, 'pathPattern'),
            mimeType: getAttr(fc, 'mimeType'),
          });
        }
      }
      filters.push(filter);
    }
  }
  return filters;
}

export function parseManifest(doc: AXMLDocument): ManifestInfo {
  const root = doc.rootElement;
  if (!root || root.tag !== 'manifest') {
    throw new Error('Invalid AndroidManifest.xml: root element is not <manifest>');
  }

  const info: ManifestInfo = {
    packageName: getAttr(root, 'package') || '',
    versionCode: getAttr(root, 'versionCode') || '',
    versionName: getAttr(root, 'versionName') || '',
    minSdkVersion: '',
    targetSdkVersion: '',
    compileSdkVersion: getAttr(root, 'compileSdkVersion') || '',
    permissions: [],
    usesFeatures: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    application: {
      label: '',
      icon: '',
      debuggable: false,
      allowBackup: false,
      supportsRtl: false,
      theme: '',
    },
  };

  for (const child of root.children) {
    switch (child.tag) {
      case 'uses-sdk': {
        info.minSdkVersion = getAttr(child, 'minSdkVersion') || '';
        info.targetSdkVersion = getAttr(child, 'targetSdkVersion') || '';
        if (!info.compileSdkVersion) {
          info.compileSdkVersion = getAttr(child, 'compileSdkVersion') || '';
        }
        break;
      }

      case 'uses-permission': {
        const name = getAttr(child, 'name') || '';
        info.permissions.push({
          name,
          description: PERMISSION_DESCRIPTIONS[name] || 'Custom permission',
        });
        break;
      }

      case 'uses-feature': {
        const name = getAttr(child, 'name') || '';
        if (name) info.usesFeatures.push(name);
        break;
      }

      case 'application': {
        info.application.label = getAttr(child, 'label') || '';
        info.application.icon = getAttr(child, 'icon') || '';
        info.application.debuggable = getAttr(child, 'debuggable') === 'true';
        info.application.allowBackup = getAttr(child, 'allowBackup') === 'true';
        info.application.supportsRtl = getAttr(child, 'supportsRtl') === 'true';
        info.application.theme = getAttr(child, 'theme') || '';

        for (const comp of child.children) {
          const componentTypes = ['activity', 'service', 'receiver', 'provider'] as const;
          if (componentTypes.includes(comp.tag as typeof componentTypes[number])) {
            const component: ManifestComponent = {
              type: comp.tag as ManifestComponent['type'],
              name: getAttr(comp, 'name') || '',
              exported: getAttr(comp, 'exported') === 'true' ? true :
                getAttr(comp, 'exported') === 'false' ? false : null,
              permission: getAttr(comp, 'permission') || '',
              intentFilters: parseIntentFilters(comp),
            };

            switch (comp.tag) {
              case 'activity': info.activities.push(component); break;
              case 'service': info.services.push(component); break;
              case 'receiver': info.receivers.push(component); break;
              case 'provider': info.providers.push(component); break;
            }
          }
        }
        break;
      }
    }
  }

  return info;
}
