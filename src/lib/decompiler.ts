/**
 * WASM-based DEX decompiler wrapper.
 * Lazy-loads the WASM module on first use.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmModule: any = null;
let initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (wasmModule) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic import with string variable to bypass TS module resolution
    const wasmUrl = '/wasm/dex_wasm.js';
    const wasm = await (Function('url', 'return import(url)')(wasmUrl));
    await wasm.default('/wasm/dex_wasm_bg.wasm');
    wasmModule = wasm;
  })();

  return initPromise;
}

export async function decompileDex(dexBytes: ArrayBuffer): Promise<string> {
  await ensureInit();
  const data = new Uint8Array(dexBytes);
  return wasmModule.decompile_dex(data);
}

export async function decompileClass(dexBytes: ArrayBuffer, className: string): Promise<string> {
  await ensureInit();
  const data = new Uint8Array(dexBytes);
  return wasmModule.decompile_class(data, className);
}

export async function listClasses(dexBytes: ArrayBuffer): Promise<string[]> {
  await ensureInit();
  const data = new Uint8Array(dexBytes);
  const json = wasmModule.list_classes(data);
  return JSON.parse(json);
}
