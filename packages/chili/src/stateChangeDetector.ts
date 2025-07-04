// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { IDocument, PubSub, Serialized } from "chili-core";

export type StateChangeResult = "success" | "no_changes";

export interface StateChangeDialogOptions {
    title: string;
    message: string;
    saveButtonText: string;
    discardButtonText: string;
}

// Define message types for parent app communication
interface StateChangeMessage {
    type: "STATE_CHANGE_DETECTED";
    hasChanges: boolean;
    timestamp: number;
}

interface StateChangeResponse {
    type: "STATE_CHANGE_RESPONSE";
    result: StateChangeResult;
    timestamp: number;
}

export class StateChangeDetector {
    private initialStateSnapshot: Serialized | null = null;
    private isInitialized: boolean = false;
    private isHandlingSave: boolean = false;

    /**
     * Creates a deep copy of the current document state
     */
    createInitialSnapshot(document: IDocument): void {
        if (this.isInitialized) {
            console.warn("StateChangeDetector already initialized");
            return;
        }

        try {
            // Create a deep copy of the document state
            const serializedState = document.serialize();
            this.initialStateSnapshot = JSON.parse(JSON.stringify(serializedState));
            this.isInitialized = true;
            console.log("Initial state snapshot created successfully");
        } catch (error) {
            console.error("Failed to create initial state snapshot:", error);
            throw error;
        }
    }

    /**
     * Compares the current state with the initial snapshot to detect changes
     */
    detectChanges(document: IDocument): boolean {
        if (!this.isInitialized || !this.initialStateSnapshot) {
            console.warn("StateChangeDetector not initialized");
            return false;
        }

        try {
            const currentState = document.serialize();

            // Add debugging to see what's being compared
            console.log("Current state keys:", Object.keys(currentState || {}));
            console.log("Initial state keys:", Object.keys(this.initialStateSnapshot || {}));

            // Compare the serialized states
            const hasChanges = this.deepCompare(currentState, this.initialStateSnapshot);

            console.log("State change detection completed. Has changes:", hasChanges);

            // If changes are detected, log more details for debugging
            if (hasChanges) {
                console.log("Changes detected! Debugging comparison...");
                this.debugComparison(currentState, this.initialStateSnapshot);
            } else {
                console.log("No changes detected - this might be correct or we might be missing something");
            }

            return hasChanges;
        } catch (error) {
            console.error("Failed to detect state changes:", error);
            return false;
        }
    }

    /**
     * Debug helper to identify what's different between states
     */
    private debugComparison(currentState: any, initialState: any, path: string = ""): void {
        if (typeof currentState !== typeof initialState) {
            console.log(`Type mismatch at ${path}:`, typeof currentState, "vs", typeof initialState);
            return;
        }

        if (typeof currentState !== "object" || currentState === null || initialState === null) {
            if (currentState !== initialState) {
                console.log(`Value mismatch at ${path}:`, currentState, "vs", initialState);
            }
            return;
        }

        if (Array.isArray(currentState) !== Array.isArray(initialState)) {
            console.log(
                `Array mismatch at ${path}:`,
                Array.isArray(currentState),
                "vs",
                Array.isArray(initialState),
            );
            return;
        }

        if (Array.isArray(currentState)) {
            if (currentState.length !== initialState.length) {
                console.log(
                    `Array length mismatch at ${path}:`,
                    currentState.length,
                    "vs",
                    initialState.length,
                );
                return;
            }
            for (let i = 0; i < currentState.length; i++) {
                this.debugComparison(currentState[i], initialState[i], `${path}[${i}]`);
            }
            return;
        }

        const keys1 = Object.keys(currentState);
        const keys2 = Object.keys(initialState);

        // Special handling for shape properties in debug mode - use same logic as compareShapeProperties
        if (path.includes("shape.properties") || path.includes(".shape.properties")) {
            this.debugShapeProperties(currentState, initialState, path);
            return;
        }

        // Filter out ignored fields before comparison
        const nonIgnoredKeys1 = keys1.filter((key) => !this.shouldIgnoreField(key));
        const nonIgnoredKeys2 = keys2.filter((key) => !this.shouldIgnoreField(key));

        if (nonIgnoredKeys1.length !== nonIgnoredKeys2.length) {
            console.log(
                `Object key count mismatch at ${path} (ignoring system fields):`,
                nonIgnoredKeys1.length,
                "vs",
                nonIgnoredKeys2.length,
            );
            console.log("Current non-ignored keys:", nonIgnoredKeys1);
            console.log("Initial non-ignored keys:", nonIgnoredKeys2);
            return;
        }

        for (const key of nonIgnoredKeys1) {
            if (!nonIgnoredKeys2.includes(key)) {
                console.log(`Missing key in initial state at ${path}.${key}`);
                return;
            }

            this.debugComparison(currentState[key], initialState[key], `${path}.${key}`);
        }
    }

    /**
     * Debug helper specifically for shape properties
     */
    private debugShapeProperties(currentState: any, initialState: any, path: string): void {
        const keys1 = Object.keys(currentState);
        const keys2 = Object.keys(initialState);

        console.log(`Shape properties comparison at ${path}:`);
        console.log("Current keys:", keys1);
        console.log("Initial keys:", keys2);

        // Use the same logic as compareShapeProperties
        // If the only difference is an 'error' field being added, ignore it
        if (keys1.length === keys2.length + 1 && keys1.includes("error") && !keys2.includes("error")) {
            console.log(`✓ Error field added to shape properties at ${path} - treating as no change`);
            return;
        }

        // If the only difference is an 'error' field being removed, ignore it
        if (keys2.length === keys1.length + 1 && keys2.includes("error") && !keys1.includes("error")) {
            console.log(`✓ Error field removed from shape properties at ${path} - treating as no change`);
            return;
        }

        // Check if there are other differences beyond error fields
        const nonErrorKeys1 = keys1.filter((key) => key !== "error");
        const nonErrorKeys2 = keys2.filter((key) => key !== "error");

        console.log(`Non-error keys comparison at ${path}:`, nonErrorKeys1, "vs", nonErrorKeys2);

        if (nonErrorKeys1.length !== nonErrorKeys2.length) {
            console.log(
                `⚠️ Non-error key count mismatch at ${path}:`,
                nonErrorKeys1.length,
                "vs",
                nonErrorKeys2.length,
            );
            console.log("Non-error current keys:", nonErrorKeys1);
            console.log("Non-error initial keys:", nonErrorKeys2);
            return;
        }

        // Compare non-error keys
        for (const key of nonErrorKeys1) {
            if (!nonErrorKeys2.includes(key)) {
                console.log(`⚠️ Missing non-error key in initial state: ${key}`);
                return;
            }
            this.debugComparison(currentState[key], initialState[key], `${path}.${key}`);
        }

        console.log(`✓ Shape properties at ${path} are equivalent (ignoring error fields)`);
    }

    /**
     * Sends response to parent app
     */
    private sendResponseToParent(result: StateChangeResult): void {
        try {
            const response = {
                type: "COMMAND_RESPONSE",
                command: "SAVE_AND_CLOSE",
                status: "completed",
                result: result,
                timestamp: Date.now(),
            };

            console.log("Sending command response to parent:", response);

            // Send message to parent window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(response, "*");
                console.log("Command response sent successfully to parent");
            } else {
                console.log("No parent window found, response logged:", response);
            }
        } catch (error) {
            console.error("Error sending response to parent:", error);
        }
    }

    /**
     * Shows a custom dialog for state change confirmation
     */
    async showStateChangeDialog(options: StateChangeDialogOptions): Promise<StateChangeResult> {
        return new Promise((resolve) => {
            const dialog = document.createElement("dialog");
            dialog.className = "state-change-dialog";

            // Create dialog content
            const dialogContent = document.createElement("div");
            dialogContent.className = "dialog-content";

            // Title
            const title = document.createElement("h2");
            title.textContent = options.title;
            title.className = "dialog-title";

            // Message
            const message = document.createElement("p");
            message.textContent = options.message;
            message.className = "dialog-message";

            // Buttons container
            const buttonsContainer = document.createElement("div");
            buttonsContainer.className = "dialog-buttons";

            // Save and Continue button
            const saveButton = document.createElement("button");
            saveButton.textContent = options.saveButtonText;
            saveButton.className = "dialog-button save-button";
            saveButton.onclick = async () => {
                dialog.remove();

                // Show saving indicator
                console.log("User chose to save and continue, executing save command...");

                // Set flag to indicate we're handling a save operation
                this.isHandlingSave = true;

                try {
                    // Execute the save command
                    PubSub.default.pub("executeCommand", "doc.save");

                    // Wait for save to complete by listening for toast events
                    const saveResult = await this.waitForSaveCompletion();

                    const result: StateChangeResult = saveResult === "success" ? "success" : "no_changes";
                    this.sendResponseToParent(result);
                    resolve(result);
                } finally {
                    // Clear the flag when save operation is complete
                    this.isHandlingSave = false;
                }
            };

            // Discard Changes button
            const discardButton = document.createElement("button");
            discardButton.textContent = options.discardButtonText;
            discardButton.className = "dialog-button discard-button";
            discardButton.onclick = () => {
                dialog.remove();
                const result: StateChangeResult = "no_changes";
                this.sendResponseToParent(result);
                resolve(result);
            };

            // Assemble dialog
            buttonsContainer.appendChild(saveButton);
            buttonsContainer.appendChild(discardButton);
            dialogContent.appendChild(title);
            dialogContent.appendChild(message);
            dialogContent.appendChild(buttonsContainer);
            dialog.appendChild(dialogContent);

            // Add styles
            this.addDialogStyles();

            // Show dialog
            document.body.appendChild(dialog);
            dialog.showModal();
        });
    }

    /**
     * Waits for the save operation to complete
     */
    private waitForSaveCompletion(): Promise<string> {
        return new Promise((resolve) => {
            let timeoutId: NodeJS.Timeout;
            let isResolved = false;
            let saveStarted = false;
            let saveCompleted = false;

            // Set up timeout in case save takes too long
            timeoutId = setTimeout(() => {
                if (!isResolved) {
                    console.warn("Save operation timed out");
                    isResolved = true;
                    resolve("error");
                }
            }, 30000); // 30 second timeout

            // Listen for save completion events
            const handleToast = (message: string) => {
                if (isResolved) return;

                console.log("Toast event received during save:", message);

                if (message === "toast.document.saved" || message === "toast.document.sent") {
                    if (!saveStarted) {
                        // Save just started - wait for it to complete
                        saveStarted = true;
                        console.log("Save operation started, waiting for completion...");
                    } else {
                        // Save completed successfully
                        clearTimeout(timeoutId);
                        console.log("Save completed successfully");
                        saveCompleted = true;

                        // Wait a bit more to ensure the "Please wait..." message is hidden
                        setTimeout(() => {
                            if (!isResolved) {
                                isResolved = true;
                                resolve("success");
                            }
                        }, 500); // Wait 500ms for UI to update
                    }
                } else if (message === "toast.fail") {
                    clearTimeout(timeoutId);
                    console.error("Save failed");
                    isResolved = true;
                    resolve("error");
                }
            };

            // Subscribe to toast events
            PubSub.default.sub("showToast", handleToast);

            // Also listen for the permanent message to disappear (indicating save completion)
            const checkForSaveCompletion = () => {
                if (isResolved) return;

                // Check if there's a "Please wait..." message visible
                const permanentMessages = document.querySelectorAll("[data-permanent-message]");
                const hasWaitMessage = Array.from(permanentMessages).some(
                    (el) =>
                        el.textContent?.includes("Please wait") ||
                        el.textContent?.includes("save") ||
                        el.textContent?.includes("Save"),
                );

                if (saveStarted && !hasWaitMessage && saveCompleted) {
                    // Save operation is fully complete
                    clearTimeout(timeoutId);
                    console.log("Save operation fully completed - no wait message visible");
                    isResolved = true;
                    resolve("success");
                } else if (saveStarted && !hasWaitMessage) {
                    // Wait message disappeared but we haven't received the completion toast yet
                    // Continue waiting for the completion toast
                    setTimeout(checkForSaveCompletion, 100);
                } else if (saveStarted) {
                    // Still waiting for the wait message to disappear
                    setTimeout(checkForSaveCompletion, 100);
                }
            };

            // Start checking for save completion after a short delay
            setTimeout(checkForSaveCompletion, 200);
        });
    }

    /**
     * Sends notification to parent app about state change detection
     */
    private sendStateChangeNotification(hasChanges: boolean): void {
        try {
            const message = {
                type: "STATE_CHANGE_DETECTED",
                hasChanges: hasChanges,
                timestamp: Date.now(),
            };

            console.log("Sending state change notification to parent:", message);

            // Send message to parent window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, "*");
                console.log("State change notification sent successfully to parent");
            } else {
                console.log("No parent window found, notification logged:", message);
            }
        } catch (error) {
            console.error("Error sending notification to parent:", error);
        }
    }

    /**
     * Main function to check for changes and handle user interaction
     * Returns event response to parent app
     */
    async checkForChanges(document: IDocument): Promise<StateChangeResult> {
        if (!this.isInitialized) {
            console.warn("StateChangeDetector not initialized, returning no_changes");
            const result: StateChangeResult = "no_changes";
            this.sendResponseToParent(result);
            return result;
        }

        const hasChanges = this.detectChanges(document);

        if (!hasChanges) {
            console.log("No changes detected, returning no_changes");
            const result: StateChangeResult = "no_changes";
            this.sendResponseToParent(result);
            return result;
        }

        console.log("Changes detected, showing dialog");

        // Send initial notification to parent that changes were detected
        this.sendStateChangeNotification(true);

        // Show custom dialog
        const result = await this.showStateChangeDialog({
            title: "Unsaved Changes Detected",
            message:
                "You have unsaved changes in your document. Would you like to save and continue, or discard the changes?",
            saveButtonText: "Save and Continue",
            discardButtonText: "Discard Changes",
        });

        // Send the final response to parent
        this.sendResponseToParent(result);

        return result;
    }

    /**
     * Resets the initial snapshot (useful for after saving)
     */
    resetSnapshot(document: IDocument): void {
        this.createInitialSnapshot(document);
    }

    /**
     * Gets whether the state change detector is currently handling a save operation
     */
    get isCurrentlyHandlingSave(): boolean {
        return this.isHandlingSave;
    }

    /**
     * Deep comparison of two objects
     */
    private deepCompare(obj1: any, obj2: any, path: string = ""): boolean {
        // Handle null/undefined cases
        if (obj1 === obj2) return false; // No change if they're the same reference
        if (obj1 == null || obj2 == null) return obj1 !== obj2;

        // Handle different types
        if (typeof obj1 !== typeof obj2) return true;

        // Handle primitives
        if (typeof obj1 !== "object") return obj1 !== obj2;

        // Handle arrays
        if (Array.isArray(obj1) !== Array.isArray(obj2)) return true;
        if (Array.isArray(obj1)) {
            // Special handling for nodes array - check if it's just an extra system node
            if (path.includes(".nodes") || path.includes("nodes")) {
                return this.compareNodesArray(obj1, obj2, path);
            }

            if (obj1.length !== obj2.length) return true;
            for (let i = 0; i < obj1.length; i++) {
                if (this.deepCompare(obj1[i], obj2[i], `${path}[${i}]`)) return true;
            }
            return false;
        }

        // Handle objects
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        // Special handling for shape properties that get error fields added
        if (path.includes("shape.properties") || path.includes(".shape.properties")) {
            return this.compareShapeProperties(obj1, obj2, path);
        }

        if (keys1.length !== keys2.length) return true;

        for (const key of keys1) {
            if (!keys2.includes(key)) return true;

            // Skip certain fields that might change automatically
            if (this.shouldIgnoreField(key)) {
                continue;
            }

            if (this.deepCompare(obj1[key], obj2[key], `${path}.${key}`)) return true;
        }

        return false;
    }

    /**
     * Special comparison for shape properties that handles automatic error field additions
     */
    private compareShapeProperties(obj1: any, obj2: any, path: string): boolean {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        console.log(`Comparing shape properties at ${path}:`, keys1, "vs", keys2);

        // If the only difference is an 'error' field being added, ignore it
        if (keys1.length === keys2.length + 1 && keys1.includes("error") && !keys2.includes("error")) {
            console.log(`Error field added to shape properties at ${path} - treating as no change`);
            return false;
        }

        // If the only difference is an 'error' field being removed, ignore it
        if (keys2.length === keys1.length + 1 && keys2.includes("error") && !keys1.includes("error")) {
            console.log(`Error field removed from shape properties at ${path} - treating as no change`);
            return false;
        }

        // If there are other differences beyond error fields, check them
        const nonErrorKeys1 = keys1.filter((key) => key !== "error");
        const nonErrorKeys2 = keys2.filter((key) => key !== "error");

        console.log(`Non-error keys comparison at ${path}:`, nonErrorKeys1, "vs", nonErrorKeys2);

        if (nonErrorKeys1.length !== nonErrorKeys2.length) {
            console.log(
                `Non-error key count mismatch at ${path}:`,
                nonErrorKeys1.length,
                "vs",
                nonErrorKeys2.length,
            );
            return true;
        }

        for (const key of nonErrorKeys1) {
            if (!nonErrorKeys2.includes(key)) {
                console.log(`Missing non-error key at ${path}:`, key);
                return true;
            }
            if (this.deepCompare(obj1[key], obj2[key], `${path}.${key}`)) return true;
        }

        console.log(`Shape properties at ${path} are equivalent (ignoring error fields)`);
        return false;
    }

    /**
     * Special comparison for nodes array that handles automatic node additions
     */
    private compareNodesArray(arr1: any[], arr2: any[], path: string): boolean {
        // If the difference is just 1 node, it might be a system node
        if (Math.abs(arr1.length - arr2.length) === 1) {
            console.log(
                `Nodes array length difference of 1 detected at ${path}: ${arr1.length} vs ${arr2.length}`,
            );

            // Check if this is likely a system node by examining the difference
            const longerArray = arr1.length > arr2.length ? arr1 : arr2;
            const shorterArray = arr1.length > arr2.length ? arr2 : arr1;

            // Look for system-like nodes (nodes with specific properties that indicate they're system-generated)
            const extraNode = longerArray.find(
                (node) =>
                    !shorterArray.some(
                        (existingNode) =>
                            existingNode.id === node.id || existingNode.classKey === node.classKey,
                    ),
            );

            if (extraNode) {
                // Check if this looks like a system node
                const isSystemNode = this.isSystemNode(extraNode);
                if (isSystemNode) {
                    console.log("This appears to be a system node addition - treating as no change");
                    return false;
                } else {
                    console.log("This appears to be a user-created node - treating as change");
                    return true;
                }
            }

            // If we can't determine, be conservative and treat as change
            console.log("Cannot determine if extra node is system-generated - treating as change");
            return true;
        }

        // If the difference is more than 1, it's likely a real change
        if (arr1.length !== arr2.length) {
            console.log(
                `Significant nodes array length difference at ${path}: ${arr1.length} vs ${arr2.length}`,
            );
            return true;
        }

        // Same length - compare each element
        for (let i = 0; i < arr1.length; i++) {
            if (this.deepCompare(arr1[i], arr2[i], `${path}[${i}]`)) return true;
        }

        return false;
    }

    /**
     * Check if a node appears to be a system-generated node
     */
    private isSystemNode(node: any): boolean {
        // System nodes often have specific characteristics
        // This is a heuristic - adjust based on your system's node structure

        // Check for system-like class keys
        const systemClassKeys = ["system", "internal", "temp", "cache", "helper", "utility"];
        if (
            node.classKey &&
            systemClassKeys.some((key) => node.classKey.toLowerCase().includes(key.toLowerCase()))
        ) {
            return true;
        }

        // Check for system-like properties
        if (node.properties) {
            const systemProps = ["isSystem", "isInternal", "isTemporary", "isHelper"];
            if (systemProps.some((prop) => node.properties[prop] === true)) {
                return true;
            }
        }

        // Check for system-like names
        if (node.name) {
            const systemNames = ["system", "internal", "temp", "cache", "helper", "utility"];
            if (systemNames.some((name) => node.name.toLowerCase().includes(name.toLowerCase()))) {
                return true;
            }
        }

        // If none of the above, assume it's a user node
        return false;
    }

    /**
     * Check if a field should be ignored during comparison
     */
    private shouldIgnoreField(fieldName: string): boolean {
        // Fields that might change automatically and shouldn't trigger change detection
        const ignoreFields = [
            "timestamp",
            "lastModified",
            "lastmodified",
            "last_modified",
            "createdAt",
            "created_at",
            "updatedAt",
            "updated_at",
            "modified",
            "modification",
            "id", // Generated IDs might change
            "uuid",
            "guid",
            "version",
            "revision",
            "checksum",
            "hash",
            "signature",
            "cache",
            "temp",
            "temporary",
            "session",
            "instance",
            "random",
            "seed",
            "time",
            "date",
            "created",
            "updated",
            "error", // Error fields added by system
        ];

        return ignoreFields.some((ignoreField) =>
            fieldName.toLowerCase().includes(ignoreField.toLowerCase()),
        );
    }

    /**
     * Adds CSS styles for the custom dialog
     */
    private addDialogStyles(): void {
        if (document.getElementById("state-change-dialog-styles")) {
            return; // Styles already added
        }

        const style = document.createElement("style");
        style.id = "state-change-dialog-styles";
        style.textContent = `
            .state-change-dialog {
                border: none;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                padding: 0;
                background: transparent;
            }

            .state-change-dialog::backdrop {
                background-color: rgba(0, 0, 0, 0.5);
            }

            .dialog-content {
                background: white;
                border-radius: 8px;
                padding: 24px;
                min-width: 400px;
                max-width: 500px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }

            .dialog-title {
                margin: 0 0 16px 0;
                font-size: 18px;
                font-weight: 600;
                color: #333;
            }

            .dialog-message {
                margin: 0 0 24px 0;
                font-size: 14px;
                line-height: 1.5;
                color: #666;
            }

            .dialog-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }

            .dialog-button {
                padding: 8px 16px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
                min-width: 100px;
            }

            .dialog-button:hover {
                background-color: #f5f5f5;
            }

            .save-button {
                background-color: #007bff;
                color: white;
                border-color: #007bff;
            }

            .save-button:hover {
                background-color: #0056b3;
                border-color: #0056b3;
            }

            .discard-button {
                background-color: #6c757d;
                color: white;
                border-color: #6c757d;
            }

            .discard-button:hover {
                background-color: #545b62;
                border-color: #545b62;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Test method to verify state change detection is working correctly
     */
    async testStateChangeDetection(document: IDocument): Promise<void> {
        console.log("=== Testing State Change Detection ===");

        try {
            // 1. Create initial snapshot
            this.createInitialSnapshot(document);
            console.log("✓ Initial snapshot created");

            // 2. Check immediately (should be no changes)
            console.log("Checking for changes immediately after snapshot...");
            const result1 = await this.checkForChanges(document);
            console.log("Immediate check result:", result1);

            if (result1 === "no_changes") {
                console.log("✓ Correctly detected no changes immediately");
            } else {
                console.log("✗ Unexpected result - showing dialog when no changes exist");
            }
        } catch (error) {
            console.error("Test failed:", error);
        }
    }
}
