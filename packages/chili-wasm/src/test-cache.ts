// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger } from "chili-core";
import { clearWasmCache, getWasmCacheInfo, initWasm, isWasmCached } from "./wasm";

export async function testWasmCache(): Promise<void> {
    Logger.info("=== WASM Cache Test Started ===");

    try {
        // Test 1: Check initial cache status
        Logger.info("Test 1: Checking initial cache status");
        const initialCacheInfo = await getWasmCacheInfo();
        Logger.info("Initial cache info:", initialCacheInfo);

        // Test 2: Clear cache if exists
        Logger.info("Test 2: Clearing cache");
        await clearWasmCache();

        // Test 3: Verify cache is empty
        Logger.info("Test 3: Verifying cache is empty");
        const isEmpty = await isWasmCached();
        Logger.info("Cache is empty:", !isEmpty);

        // Test 4: First load (should cache)
        Logger.info("Test 4: First WASM load (should cache)");
        const startTime1 = performance.now();
        await initWasm();
        const loadTime1 = performance.now() - startTime1;
        Logger.info(`First load completed in ${loadTime1.toFixed(2)}ms`);

        // Test 5: Check cache was created
        Logger.info("Test 5: Checking cache was created");
        const cacheInfo1 = await getWasmCacheInfo();
        Logger.info("Cache info after first load:", cacheInfo1);

        // Test 6: Second load (should use cache)
        Logger.info("Test 6: Second WASM load (should use cache)");
        const startTime2 = performance.now();
        await initWasm();
        const loadTime2 = performance.now() - startTime2;
        Logger.info(`Second load completed in ${loadTime2.toFixed(2)}ms`);

        // Test 7: Performance comparison
        Logger.info("Test 7: Performance comparison");
        const improvement = ((loadTime1 - loadTime2) / loadTime1) * 100;
        Logger.info(`Performance improvement: ${improvement.toFixed(1)}%`);
        Logger.info(`First load: ${loadTime1.toFixed(2)}ms`);
        Logger.info(`Second load: ${loadTime2.toFixed(2)}ms`);

        // Test 8: Final cache status
        Logger.info("Test 8: Final cache status");
        const finalCacheInfo = await getWasmCacheInfo();
        Logger.info("Final cache info:", finalCacheInfo);

        Logger.info("=== WASM Cache Test Completed Successfully ===");
    } catch (error) {
        Logger.error("WASM Cache Test Failed:", error);
        throw error;
    }
}

// Run test if this file is executed directly
if (typeof window !== "undefined" && window.location.search.includes("test-cache")) {
    testWasmCache().catch(console.error);
}
