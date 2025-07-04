// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { StateChangeDetector, StateChangeResult } from "./stateChangeDetector";

/**
 * Example demonstrating parent app communication with state change detection
 * This shows how the system sends event responses to the parent application
 */
export class ParentAppCommunicationExample {
    private stateChangeDetector: StateChangeDetector = new StateChangeDetector();

    /**
     * Example: Initialize and test parent app communication
     */
    async testParentAppCommunication(document: any): Promise<void> {
        try {
            // 1. Initialize state detection
            this.stateChangeDetector.createInitialSnapshot(document);
            console.log("State detection initialized");

            // 2. Simulate some changes to the document
            // (In real usage, this would be actual user modifications)
            console.log("Simulating document changes...");

            // 3. Check for changes - this will communicate with parent app
            const result = await this.stateChangeDetector.checkForChanges(document);

            console.log("State change check completed with result:", result);

            // 4. Handle the result
            switch (result) {
                case "success":
                    console.log("User chose to save and continue");
                    // Reset snapshot after successful save
                    this.stateChangeDetector.resetSnapshot(document);
                    break;
                case "no_changes":
                    console.log("No changes detected or user chose to discard");
                    break;
            }
        } catch (error) {
            console.error("Error in parent app communication test:", error);
        }
    }

    /**
     * Example: Listen for parent app messages (for testing purposes)
     */
    setupParentAppMessageListener(): void {
        window.addEventListener("message", (event) => {
            // Only process messages from parent
            if (event.source !== window.parent) return;

            const message = event.data;

            switch (message.type) {
                case "STATE_CHANGE_DETECTED":
                    console.log("Parent app received state change notification:", message);
                    break;
                case "STATE_CHANGE_RESPONSE":
                    console.log("Parent app received state change response:", message);
                    break;
            }
        });

        console.log("Parent app message listener set up");
    }

    /**
     * Example: Manual trigger for testing
     */
    async manualTrigger(document: any): Promise<StateChangeResult> {
        console.log("Manually triggering state change check...");
        return await this.stateChangeDetector.checkForChanges(document);
    }
}

/**
 * Usage example for parent app communication:
 *
 * // 1. Set up message listener (in parent app)
 * const example = new ParentAppCommunicationExample();
 * example.setupParentAppMessageListener();
 *
 * // 2. Initialize state detection
 * await example.testParentAppCommunication(document);
 *
 * // 3. Manual trigger when needed
 * const result = await example.manualTrigger(document);
 *
 * // 4. Parent app will receive messages:
 * // - STATE_CHANGE_DETECTED when changes are found
 * // - STATE_CHANGE_RESPONSE when user makes a choice
 *
 * // Message format:
 * // {
 * //   type: "STATE_CHANGE_DETECTED",
 * //   hasChanges: true,
 * //   timestamp: 1234567890
 * // }
 *
 * // {
 * //   type: "STATE_CHANGE_RESPONSE",
 * //   result: "success" | "no_changes",
 * //   timestamp: 1234567890
 * // }
 */
