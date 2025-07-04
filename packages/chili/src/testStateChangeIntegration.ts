// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { StateChangeDetector, StateChangeResult } from "./stateChangeDetector";

/**
 * Test integration of state change detection with command system
 * This helps debug the SAVE_AND_CLOSE command integration
 */
export class StateChangeIntegrationTest {
    private stateChangeDetector: StateChangeDetector = new StateChangeDetector();

    /**
     * Test the complete flow for SAVE_AND_CLOSE command
     */
    async testSaveAndCloseFlow(document: any): Promise<void> {
        try {
            console.log("=== Testing SAVE_AND_CLOSE Flow ===");

            // 1. Initialize state detection
            this.stateChangeDetector.createInitialSnapshot(document);
            console.log("✓ State detection initialized");

            // 2. Simulate some changes (this would be real user modifications)
            console.log("Simulating document changes...");
            // In a real scenario, the document would have been modified by the user

            // 3. Test the state change check (this is what SAVE_AND_CLOSE should do)
            console.log("Checking for state changes...");
            const result = await this.stateChangeDetector.checkForChanges(document);

            console.log("State change check result:", result);

            // 4. Handle the result
            switch (result) {
                case "success":
                    console.log("✓ User chose to save and continue");
                    // This should trigger the actual save command
                    console.log("→ Should proceed with doc.save command");
                    break;
                case "no_changes":
                    console.log("✓ No changes detected or user chose to discard");
                    console.log("→ Should send success response to parent");
                    break;
            }

            console.log("=== Test completed ===");
        } catch (error) {
            console.error("Error in SAVE_AND_CLOSE flow test:", error);
        }
    }

    /**
     * Test without changes (should not show dialog)
     */
    async testNoChangesFlow(document: any): Promise<void> {
        try {
            console.log("=== Testing No Changes Flow ===");

            // 1. Initialize state detection
            this.stateChangeDetector.createInitialSnapshot(document);
            console.log("✓ State detection initialized");

            // 2. Check immediately (no changes should be detected)
            console.log("Checking for state changes (no changes expected)...");
            const result = await this.stateChangeDetector.checkForChanges(document);

            console.log("State change check result:", result);

            if (result === "no_changes") {
                console.log("✓ Correctly detected no changes");
                console.log("→ Should send success response to parent immediately");
            } else {
                console.log("✗ Unexpected result:", result);
            }

            console.log("=== Test completed ===");
        } catch (error) {
            console.error("Error in no changes flow test:", error);
        }
    }

    /**
     * Test manual trigger (for debugging)
     */
    async manualTest(document: any): Promise<StateChangeResult> {
        console.log("=== Manual State Change Test ===");

        if (!this.stateChangeDetector) {
            console.error("StateChangeDetector not initialized");
            return "no_changes";
        }

        const result = await this.stateChangeDetector.checkForChanges(document);
        console.log("Manual test result:", result);

        return result;
    }

    /**
     * Debug helper to check if state detection is working
     */
    debugStateDetection(document: any): void {
        console.log("=== Debug State Detection ===");

        try {
            // Check if document exists
            if (!document) {
                console.error("Document is null or undefined");
                return;
            }

            console.log("Document exists:", !!document);

            // Check if document has serialize method
            if (typeof document.serialize !== "function") {
                console.error("Document does not have serialize method");
                return;
            }

            console.log("Document has serialize method");

            // Try to serialize the document
            try {
                const serialized = document.serialize();
                console.log("Document serialization successful:", !!serialized);
                console.log("Serialized data keys:", Object.keys(serialized || {}));
            } catch (error) {
                console.error("Document serialization failed:", error);
            }
        } catch (error) {
            console.error("Debug error:", error);
        }
    }
}

/**
 * Usage for debugging:
 *
 * // 1. Create test instance
 * const test = new StateChangeIntegrationTest();
 *
 * // 2. Debug state detection
 * test.debugStateDetection(document);
 *
 * // 3. Test no changes flow
 * await test.testNoChangesFlow(document);
 *
 * // 4. Test with changes flow
 * await test.testSaveAndCloseFlow(document);
 *
 * // 5. Manual test
 * const result = await test.manualTest(document);
 */
