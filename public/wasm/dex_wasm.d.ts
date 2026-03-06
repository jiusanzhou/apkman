/* tslint:disable */
/* eslint-disable */

/**
 * Decompile a single class by name from a DEX file.
 * class_name should be in Dalvik format like "Lcom/example/MyClass;"
 */
export function decompile_class(data: Uint8Array, class_name: string): string;

/**
 * Decompile an entire DEX file to Java source.
 * Returns the full decompiled Java source as a single string.
 */
export function decompile_dex(data: Uint8Array): string;

/**
 * List all class names in a DEX file.
 * Returns JSON array of class names.
 */
export function list_classes(data: Uint8Array): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly decompile_class: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly decompile_dex: (a: number, b: number) => [number, number, number, number];
    readonly list_classes: (a: number, b: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
