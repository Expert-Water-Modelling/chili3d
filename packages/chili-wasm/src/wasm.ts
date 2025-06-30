// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger } from "chili-core";
import MainModuleFactory, { MainModule } from "../lib/chili-wasm";

declare global {
    var wasm: MainModule;
}

const WASM_CACHE_KEY = "chili3d_wasm_cache";
const WASM_CACHE_VERSION = "1.0.0"; // Increment when WASM changes

// Flag to disable caching if there are issues
let CACHE_DISABLED = false;

// Check URL parameters for debugging
if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("no-cache")) {
        CACHE_DISABLED = true;
        Logger.info("WASM caching disabled via URL parameter");
    }
}

interface WasmCacheEntry {
    version: string;
    data: ArrayBuffer;
    timestamp: number;
}

interface WasmCacheInfo {
    isCached: boolean;
    version: string;
    size: number;
    timestamp: number;
    age: number;
}

class WasmCache {
    private db: IDBDatabase | null = null;
    private readonly dbName = "Chili3DWasmCache";
    private readonly storeName = "wasm";

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async get(key: string): Promise<ArrayBuffer | null> {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const entry: WasmCacheEntry | undefined = request.result;
                if (entry && entry.version === WASM_CACHE_VERSION) {
                    resolve(entry.data);
                } else {
                    resolve(null);
                }
            };
        });
    }

    async set(key: string, data: ArrayBuffer): Promise<void> {
        if (!this.db) return;

        const entry: WasmCacheEntry = {
            version: WASM_CACHE_VERSION,
            data: data,
            timestamp: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.put(entry, key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getInfo(key: string): Promise<WasmCacheInfo | null> {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const entry: WasmCacheEntry | undefined = request.result;
                if (entry && entry.version === WASM_CACHE_VERSION) {
                    const now = Date.now();
                    resolve({
                        isCached: true,
                        version: entry.version,
                        size: entry.data.byteLength,
                        timestamp: entry.timestamp,
                        age: now - entry.timestamp,
                    });
                } else {
                    resolve({
                        isCached: false,
                        version: "",
                        size: 0,
                        timestamp: 0,
                        age: 0,
                    });
                }
            };
        });
    }

    async clear(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }
}

// Helper function to validate WASM binary
function isValidWasmBinary(data: ArrayBuffer): boolean {
    const bytes = new Uint8Array(data);
    // Check WASM magic number: 0x00 0x61 0x73 0x6d
    return (
        bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d
    );
}

// Helper function to fetch WASM binary with proper error handling
async function fetchWasmBinary(): Promise<ArrayBuffer> {
    try {
        const response = await fetch("chili-wasm.wasm");

        if (!response.ok) {
            throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        if (
            contentType &&
            !contentType.includes("application/wasm") &&
            !contentType.includes("application/octet-stream")
        ) {
            Logger.warn(`Unexpected content type for WASM: ${contentType}`);
        }

        const buffer = await response.arrayBuffer();

        if (!isValidWasmBinary(buffer)) {
            throw new Error("Invalid WASM binary: wrong magic number");
        }

        return buffer;
    } catch (error) {
        Logger.error("Failed to fetch WASM binary:", error);
        throw error;
    }
}

export async function initWasm(): Promise<MainModule> {
    Logger.info("WASM initialization started");

    // If caching is disabled, load directly from network
    if (CACHE_DISABLED) {
        Logger.info("Caching disabled, loading WASM from network");
        const startTime = performance.now();
        global.wasm = await MainModuleFactory();
        const loadTime = performance.now() - startTime;
        Logger.info(`WASM loaded from network in ${loadTime.toFixed(2)}ms`);
        return global.wasm;
    }

    try {
        const cache = new WasmCache();
        await cache.init();

        // Check cache status first
        const cacheInfo = await cache.getInfo(WASM_CACHE_KEY);
        if (cacheInfo?.isCached) {
            Logger.info(
                `WASM cache found: ${(cacheInfo.size / 1024 / 1024).toFixed(2)}MB, age: ${(cacheInfo.age / 1000 / 60).toFixed(1)}min`,
            );
        } else {
            Logger.info("WASM cache not found");
        }

        // Try to load from cache first
        const cachedWasm = await cache.get(WASM_CACHE_KEY);

        if (cachedWasm && isValidWasmBinary(cachedWasm)) {
            Logger.info("Loading WASM from cache");

            const startTime = performance.now();

            // Create a custom module factory that uses cached data
            const cachedModuleFactory = async (moduleArg: any = {}) => {
                // Override the wasmBinary to use cached data
                const modifiedModuleArg = {
                    ...moduleArg,
                    wasmBinary: cachedWasm,
                };

                return await MainModuleFactory(modifiedModuleArg);
            };

            global.wasm = await cachedModuleFactory();
            const loadTime = performance.now() - startTime;

            Logger.info(`WASM loaded from cache successfully in ${loadTime.toFixed(2)}ms`);
            return global.wasm;
        } else if (cachedWasm) {
            Logger.warn("Cached WASM data is invalid, clearing cache");
            await cache.clear();
        }

        // Cache miss or invalid cache - load from network and cache
        Logger.info("WASM not found in cache or invalid, loading from network");

        const startTime = performance.now();

        // First, fetch the WASM binary to cache it
        const wasmBuffer = await fetchWasmBinary();

        // Then initialize the module normally (it will use the network version)
        global.wasm = await MainModuleFactory();
        const loadTime = performance.now() - startTime;

        Logger.info(`WASM loaded from network in ${loadTime.toFixed(2)}ms`);

        // Cache the WASM binary for future use
        try {
            await cache.set(WASM_CACHE_KEY, wasmBuffer);
            Logger.info(
                `WASM cached successfully (${(wasmBuffer.byteLength / 1024 / 1024).toFixed(2)}MB) for future use`,
            );
        } catch (cacheError) {
            Logger.warn("Failed to cache WASM:", cacheError);
            // Don't fail the initialization if caching fails
        }

        return global.wasm;
    } catch (error) {
        Logger.error("WASM initialization failed with caching, trying without cache:", error);

        // Disable caching and try again
        CACHE_DISABLED = true;

        try {
            const startTime = performance.now();
            global.wasm = await MainModuleFactory();
            const loadTime = performance.now() - startTime;
            Logger.info(`WASM loaded from network (no cache) in ${loadTime.toFixed(2)}ms`);
            return global.wasm;
        } catch (fallbackError) {
            Logger.error("WASM initialization completely failed:", fallbackError);
            throw fallbackError;
        }
    }
}

// Utility function to clear WASM cache (useful for debugging or updates)
export async function clearWasmCache(): Promise<void> {
    if (CACHE_DISABLED) {
        Logger.info("Cache is disabled, nothing to clear");
        return;
    }

    const cache = new WasmCache();
    await cache.init();
    await cache.clear();
    Logger.info("WASM cache cleared");
}

// Utility function to get cache status
export async function getWasmCacheInfo(): Promise<WasmCacheInfo | null> {
    if (CACHE_DISABLED) {
        return null;
    }

    const cache = new WasmCache();
    await cache.init();
    return await cache.getInfo(WASM_CACHE_KEY);
}

// Utility function to check if WASM is cached
export async function isWasmCached(): Promise<boolean> {
    if (CACHE_DISABLED) {
        return false;
    }

    const info = await getWasmCacheInfo();
    return info?.isCached ?? false;
}

// Utility function to disable caching
export function disableWasmCache(): void {
    CACHE_DISABLED = true;
    Logger.info("WASM caching disabled");
}

// Utility function to enable caching
export function enableWasmCache(): void {
    CACHE_DISABLED = false;
    Logger.info("WASM caching enabled");
}
