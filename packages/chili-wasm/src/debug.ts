// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger } from "chili-core";
import { clearWasmCache, getWasmCacheInfo, isWasmCached } from "./wasm";

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
        Logger.info(`WASM content type: ${contentType}`);

        const buffer = await response.arrayBuffer();
        Logger.info(`WASM buffer size: ${buffer.byteLength} bytes`);

        if (!isValidWasmBinary(buffer)) {
            const bytes = new Uint8Array(buffer.slice(0, 16));
            const hex = Array.from(bytes)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
            Logger.error(`Invalid WASM binary. First 16 bytes: ${hex}`);
            throw new Error("Invalid WASM binary: wrong magic number");
        }

        Logger.info("WASM binary validation passed");
        return buffer;
    } catch (error) {
        Logger.error("Failed to fetch WASM binary:", error);
        throw error;
    }
}

export async function debugWasmLoading(): Promise<void> {
    Logger.info("=== WASM Debug Session Started ===");

    try {
        // Check if WASM is cached
        const cached = await isWasmCached();
        Logger.info(`WASM cached: ${cached}`);

        if (cached) {
            const cacheInfo = await getWasmCacheInfo();
            Logger.info("Cache info:", cacheInfo);
        }

        // Test fetching WASM from network
        Logger.info("Testing WASM fetch from network...");
        const wasmBuffer = await fetchWasmBinary();
        Logger.info(`Successfully fetched WASM: ${(wasmBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

        // Clear cache to start fresh
        Logger.info("Clearing cache...");
        await clearWasmCache();

        Logger.info("=== WASM Debug Session Completed ===");
    } catch (error) {
        Logger.error("WASM Debug Session Failed:", error);
        throw error;
    }
}

// Run debug if this file is executed directly
if (typeof window !== "undefined" && window.location.search.includes("debug-wasm")) {
    debugWasmLoading().catch(console.error);
}
