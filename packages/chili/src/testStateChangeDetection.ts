// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { StateChangeDetector, StateChangeResult } from "./stateChangeDetector";

/**
 * Example usage of the StateChangeDetector
 * This demonstrates how to use the state change detection system
 */
export class StateChangeDetectionExample {
    private stateChangeDetector: StateChangeDetector = new StateChangeDetector();

    /**
     * Example: Initialize state change detection
     * This should be called after the document is fully loaded
     */
    async initializeStateDetection(document: any): Promise<void> {
        try {
            // Create initial snapshot of the document state
            this.stateChangeDetector.createInitialSnapshot(document);
            console.log("State change detection initialized successfully");
        } catch (error) {
            console.error("Failed to initialize state change detection:", error);
        }
    }

    /**
     * Example: Check for changes and handle user interaction
     * This can be called whenever you want to check for changes
     */
    async checkForChanges(document: any): Promise<StateChangeResult> {
        try {
            const result = await this.stateChangeDetector.checkForChanges(document);

            switch (result) {
                case "success":
                    console.log("User chose to save and continue");
                    // Reset the snapshot after successful save
                    this.stateChangeDetector.resetSnapshot(document);
                    break;
                case "no_changes":
                    console.log("No changes detected or user chose to discard");
                    break;
            }

            return result;
        } catch (error) {
            console.error("Error checking for changes:", error);
            return "no_changes";
        }
    }

    /**
     * Example: Manual change detection without dialog
     */
    detectChangesOnly(document: any): boolean {
        return this.stateChangeDetector.detectChanges(document);
    }

    /**
     * Example: Reset snapshot after saving
     */
    resetSnapshot(document: any): void {
        this.stateChangeDetector.resetSnapshot(document);
        console.log("State snapshot reset after save");
    }
}

/**
 * Usage example:
 *
 * // 1. Initialize after document is loaded
 * const example = new StateChangeDetectionExample();
 * await example.initializeStateDetection(document);
 *
 * // 2. Check for changes when needed (e.g., before closing, before navigation)
 * const result = await example.checkForChanges(document);
 *
 * // 3. Reset snapshot after successful save
 * example.resetSnapshot(document);
 *
 * // 4. Manual change detection without dialog
 * const hasChanges = example.detectChangesOnly(document);
 */
