// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AppBuilder } from "chili-builder";
import { Logger, PubSub } from "chili-core";
import { Loading } from "./loading";

// Define message types
interface CommandMessage {
    type: "COMMAND";
    command: string;
    timestamp: number;
}

interface CommandResponse {
    type: "COMMAND_RESPONSE";
    command: string;
    status: string;
    result: string;
    timestamp: number;
}

// Store pending save operations
const pendingSaveOperations = new Map<
    string,
    {
        event: MessageEvent;
        commandId: string;
    }
>();

// Helper function to send response to parent
function sendResponseToParent(event: MessageEvent, response: CommandResponse) {
    try {
        if (event.source instanceof Window) {
            console.log("Sending response to parent:", response);
            event.source.postMessage(response, event.origin);
            console.log("Response sent successfully to parent");
        } else {
            console.log("Event source is not a Window, using window.parent.postMessage as fallback");
            // Fallback to window.parent.postMessage
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(response, "*");
                console.log("Response sent successfully to parent via fallback");
            } else {
                console.log("No parent window available, response logged:", response);
            }
        }
    } catch (error) {
        console.error("Error sending response to parent:", error);
        // Try fallback method
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(response, "*");
                console.log("Response sent successfully to parent via error fallback");
            }
        } catch (fallbackError) {
            console.error("Fallback response sending also failed:", fallbackError);
        }
    }
}

// Helper function to get the application instance
async function getApplication(): Promise<any> {
    // Try to get the app instance with retries
    for (let i = 0; i < 10; i++) {
        const app = (window as any).app || (window as any).getApplication?.();
        if (app) {
            return app;
        }
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
}

// Command handler
async function handleCommandMessage(event: MessageEvent) {
    // OPTIONAL: Check message origin
    // if (event.origin !== "https://your-main-app.com") return;

    const data = event.data as CommandMessage;

    if (data?.type === "COMMAND") {
        console.log("Received command from parent:", data.command);

        switch (data.command) {
            case "SAVE_AND_CLOSE":
                // Send immediate acknowledgment response to parent
                const ackResponse: CommandResponse = {
                    type: "COMMAND_RESPONSE",
                    command: data.command,
                    status: "acknowledged",
                    result: "processing",
                    timestamp: Date.now(),
                };
                console.log("Sending acknowledgment response to parent:", ackResponse);
                sendResponseToParent(event, ackResponse);

                // Store the operation for later completion response
                const commandId = `${data.command}_${data.timestamp}`;
                pendingSaveOperations.set(commandId, { event, commandId });

                try {
                    // Get the application instance
                    console.log("Attempting to get application instance...");
                    const app = await getApplication();
                    console.log("Application instance retrieved:", !!app);

                    if (!app) {
                        console.error("Application not available");
                        throw new Error("Application not available");
                    }

                    // Check if the app has the required methods
                    console.log("Checking app methods...");
                    console.log(
                        "app.checkForStateChanges exists:",
                        typeof app.checkForStateChanges === "function",
                    );
                    console.log("app.activeView exists:", !!app.activeView);
                    console.log("app.activeView.document exists:", !!app.activeView?.document);

                    // Check for state changes before saving
                    console.log("Checking for state changes before save...");
                    const stateChangeResult = await app.checkForStateChanges();

                    console.log("State change check result:", stateChangeResult);

                    if (stateChangeResult === "success") {
                        // User chose to save and continue - save operation already completed by state change detector
                        console.log(
                            "User chose to save and continue - save operation completed by state change detector",
                        );
                        // The state change detector already sent the COMMAND_RESPONSE and handled the save
                        pendingSaveOperations.delete(commandId);
                    } else if (stateChangeResult === "no_changes") {
                        // No changes detected or user chose to discard - response already sent by state change detector
                        console.log("No changes detected or user chose to discard - response already sent");
                        pendingSaveOperations.delete(commandId);
                    }
                } catch (error) {
                    console.error("Error during state change check:", error);
                    // Send error response
                    const errorResponse: CommandResponse = {
                        type: "COMMAND_RESPONSE",
                        command: "SAVE_AND_CLOSE",
                        status: "completed",
                        result: "error",
                        timestamp: Date.now(),
                    };
                    sendResponseToParent(event, errorResponse);
                    pendingSaveOperations.delete(commandId);
                }
                break;

            default:
                console.warn("Unknown command received from parent:", data.command);

                // Respond back to parent with error
                const errorResponse: CommandResponse = {
                    type: "COMMAND_RESPONSE",
                    command: data.command,
                    status: "completed",
                    result: "error",
                    timestamp: Date.now(),
                };
                sendResponseToParent(event, errorResponse);
        }
    }
}

// Toast event handler to detect save completion
function handleToastEvent(message: string) {
    console.log("Toast event received:", message);

    // Check if this is a save-related toast
    if (message === "toast.document.saved" || message === "toast.document.sent") {
        // Save was successful - only send completion response if there are pending operations
        // AND if the state change detector is not currently handling a save operation
        const isStateChangeDetectorHandling = (window as any).app?.stateChangeDetector
            ?.isCurrentlyHandlingSave;

        if (pendingSaveOperations.size > 0 && !isStateChangeDetectorHandling) {
            pendingSaveOperations.forEach((operation, commandId) => {
                const completionResponse: CommandResponse = {
                    type: "COMMAND_RESPONSE",
                    command: "SAVE_AND_CLOSE",
                    status: "completed",
                    result: "success",
                    timestamp: Date.now(),
                };
                console.log("Sending completion response to parent after save:", completionResponse);
                sendResponseToParent(operation.event, completionResponse);

                // Clean up
                pendingSaveOperations.delete(commandId);
            });
        } else if (isStateChangeDetectorHandling) {
            console.log("State change detector is handling save operation - not sending duplicate response");
        }
    } else if (message === "toast.fail") {
        // Save failed - only send completion response if there are pending operations
        // AND if the state change detector is not currently handling a save operation
        const isStateChangeDetectorHandling = (window as any).app?.stateChangeDetector
            ?.isCurrentlyHandlingSave;

        if (pendingSaveOperations.size > 0 && !isStateChangeDetectorHandling) {
            pendingSaveOperations.forEach((operation, commandId) => {
                const completionResponse: CommandResponse = {
                    type: "COMMAND_RESPONSE",
                    command: "SAVE_AND_CLOSE",
                    status: "completed",
                    result: "error",
                    timestamp: Date.now(),
                };
                console.log("Sending completion response to parent after save failure:", completionResponse);
                sendResponseToParent(operation.event, completionResponse);

                // Clean up
                pendingSaveOperations.delete(commandId);
            });
        } else if (isStateChangeDetectorHandling) {
            console.log("State change detector is handling save operation - not sending duplicate response");
        }
    }
}

let loading = new Loading();
document.body.appendChild(loading);

// Initialize command listener on load
window.addEventListener("load", () => {
    window.addEventListener("message", handleCommandMessage);

    // Subscribe to toast events to detect save completion
    PubSub.default.sub("showToast", handleToastEvent);
});

// Global test function for debugging state change detection
(window as any).testStateChangeDetection = async function () {
    console.log("=== Manual State Change Detection Test ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        console.log("Application found:", !!app);
        console.log("Active view:", !!app.activeView);
        console.log("Active document:", !!app.activeView?.document);

        if (app.activeView?.document) {
            console.log("Testing state change detection...");

            // Test the state change detector directly
            if (app.stateChangeDetector) {
                console.log("Testing with state change detector...");
                await app.stateChangeDetector.testStateChangeDetection(app.activeView.document);
            }

            // Test the app method
            console.log("Testing with app.checkForStateChanges...");
            const result = await app.checkForStateChanges();
            console.log("State change detection result:", result);
            return result;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Test failed:", error);
    }
};

// Global test function to create a fresh snapshot
(window as any).createFreshSnapshot = async function () {
    console.log("=== Creating Fresh Snapshot ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Creating fresh snapshot...");
            app.createInitialStateSnapshot();
            console.log("✓ Fresh snapshot created");
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Create snapshot failed:", error);
    }
};

// Global test function to check state changes without showing dialog
(window as any).checkStateChangesOnly = async function () {
    console.log("=== Checking State Changes (No Dialog) ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Checking for state changes...");

            // Use the detectChanges method directly (no dialog)
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Has changes:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Changes detected - this would show a dialog");
            } else {
                console.log("✓ No changes detected - no dialog would be shown");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Check failed:", error);
    }
};

// Global test function to create fresh snapshot and test immediately
(window as any).testFreshSnapshot = async function () {
    console.log("=== Testing Fresh Snapshot ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Creating fresh snapshot...");
            app.createInitialStateSnapshot();
            console.log("✓ Fresh snapshot created");

            // Wait a moment for any automatic updates
            await new Promise((resolve) => setTimeout(resolve, 100));

            console.log("Testing for changes immediately...");
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Has changes after fresh snapshot:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Still detecting changes - this might indicate a real issue");
            } else {
                console.log("✓ No changes detected - fix is working!");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Test failed:", error);
    }
};

// Global test function to test shape properties comparison
(window as any).testShapePropertiesComparison = async function () {
    console.log("=== Testing Shape Properties Comparison ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Testing shape properties comparison...");

            // Create a fresh snapshot first
            app.createInitialStateSnapshot();
            console.log("✓ Fresh snapshot created");

            // Wait a moment for any automatic updates
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Test the comparison with detailed debugging
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Shape properties comparison result:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Still detecting changes in shape properties");
                console.log("This might indicate other differences beyond error fields");
            } else {
                console.log("✓ Shape properties comparison working correctly");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Shape properties test failed:", error);
    }
};

// Global test function to test the shape properties fix
(window as any).testShapePropertiesFix = async function () {
    console.log("=== Testing Shape Properties Fix ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Creating fresh snapshot...");
            app.createInitialStateSnapshot();
            console.log("✓ Fresh snapshot created");

            // Wait a moment for any automatic updates
            await new Promise((resolve) => setTimeout(resolve, 500));

            console.log("Testing for changes with shape properties fix...");
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Has changes after shape properties fix:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Still detecting changes - check the logs above for details");
            } else {
                console.log("✓ Shape properties fix is working! No changes detected");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Shape properties fix test failed:", error);
    }
};

// Global test function to test lastModified and error field handling
(window as any).testFieldHandling = async function () {
    console.log("=== Testing Field Handling (lastModified + error fields) ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Creating fresh snapshot...");
            app.createInitialStateSnapshot();
            console.log("✓ Fresh snapshot created");

            // Wait a moment for any automatic updates
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log("Testing for changes with field handling...");
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Has changes after field handling fix:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Still detecting changes - this might indicate other issues");
                console.log("Check if the changes are in non-ignored fields only");
            } else {
                console.log("✓ Field handling fix is working! No changes detected");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Field handling test failed:", error);
    }
};

// Global test function to debug why legitimate changes aren't detected
(window as any).debugLegitimateChanges = async function () {
    console.log("=== Debugging Legitimate Changes Detection ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Current document state:");
            const currentState = app.activeView.document.serialize();
            console.log("Current state keys:", Object.keys(currentState || {}));

            if (app.stateChangeDetector.initialStateSnapshot) {
                console.log(
                    "Initial snapshot keys:",
                    Object.keys(app.stateChangeDetector.initialStateSnapshot || {}),
                );

                // Compare specific parts that might have changed
                console.log("Comparing properties...");
                if (currentState.properties && app.stateChangeDetector.initialStateSnapshot.properties) {
                    console.log("Current properties keys:", Object.keys(currentState.properties));
                    console.log(
                        "Initial properties keys:",
                        Object.keys(app.stateChangeDetector.initialStateSnapshot.properties),
                    );

                    // Check nodes specifically
                    if (
                        currentState.properties.nodes &&
                        app.stateChangeDetector.initialStateSnapshot.properties.nodes
                    ) {
                        console.log("Current nodes count:", currentState.properties.nodes.length);
                        console.log(
                            "Initial nodes count:",
                            app.stateChangeDetector.initialStateSnapshot.properties.nodes.length,
                        );

                        if (
                            currentState.properties.nodes.length !==
                            app.stateChangeDetector.initialStateSnapshot.properties.nodes.length
                        ) {
                            console.log("⚠️ Node count difference detected!");
                        }
                    }
                }
            } else {
                console.log("No initial snapshot found");
            }

            // Test the detection
            console.log("Testing change detection...");
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Final result - Has changes:", hasChanges);

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Debug legitimate changes failed:", error);
    }
};

// Global test function to test timing of snapshot creation
(window as any).testSnapshotTiming = async function () {
    console.log("=== Testing Snapshot Timing ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Step 1: Create a fresh snapshot now...");
            app.createInitialStateSnapshot();
            console.log("✓ Snapshot created");

            console.log("Step 2: Wait a moment for any automatic updates...");
            await new Promise((resolve) => setTimeout(resolve, 500));

            console.log("Step 3: Test for changes immediately...");
            const hasChanges1 = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Immediate check - Has changes:", hasChanges1);

            if (hasChanges1) {
                console.log(
                    "⚠️ Changes detected immediately - this suggests the snapshot was created after changes",
                );
            } else {
                console.log("✓ No changes detected immediately - snapshot timing looks good");
            }

            console.log(
                "Step 4: Now make a change (draw something, delete a face, etc.) and then test again",
            );
            console.log("After making a change, run: testSnapshotTiming() again");

            return hasChanges1;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Snapshot timing test failed:", error);
    }
};

// Global function to manually create snapshot at the right time
(window as any).createSnapshotNow = async function () {
    console.log("=== Manually Creating Snapshot Now ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Waiting for document to stabilize...");
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log("Forcing visual update...");
            if (app.activeView) {
                app.activeView.update();
                app.activeView.document.visual.update();
            }

            console.log("Creating snapshot...");
            app.createInitialStateSnapshot();
            console.log("✓ Snapshot created manually");

            // Test immediately
            console.log("Testing snapshot...");
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Has changes after manual snapshot:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Still detecting changes - document might not be stable yet");
            } else {
                console.log("✓ No changes detected - snapshot created successfully");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Manual snapshot creation failed:", error);
    }
};

// Global function to test if current snapshot is working
(window as any).testCurrentSnapshot = async function () {
    console.log("=== Testing Current Snapshot ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        if (app.activeView?.document) {
            console.log("Testing current snapshot...");
            const hasChanges = app.stateChangeDetector.detectChanges(app.activeView.document);
            console.log("Current snapshot test - Has changes:", hasChanges);

            if (hasChanges) {
                console.log("⚠️ Changes detected with current snapshot");
                console.log("This might mean:");
                console.log("1. The snapshot was created too early");
                console.log("2. There are legitimate changes that should be detected");
                console.log("3. The comparison logic is too strict");
            } else {
                console.log("✓ No changes detected with current snapshot");
                console.log("This means the snapshot is working correctly for the current state");
            }

            return hasChanges;
        } else {
            console.error("No active document found");
        }
    } catch (error) {
        console.error("Current snapshot test failed:", error);
    }
};

// Global function to test save completion waiting mechanism
(window as any).testSaveCompletionWaiting = async function () {
    console.log("=== Testing Save Completion Waiting ===");

    try {
        const app = await getApplication();
        if (!app) {
            console.error("Application not available");
            return;
        }

        console.log("Testing save completion waiting mechanism...");

        // Check if state change detector is handling a save
        const isHandlingSave = app.stateChangeDetector?.isCurrentlyHandlingSave;
        console.log("State change detector is handling save:", isHandlingSave);

        // Check for permanent messages
        const permanentMessages = document.querySelectorAll("[data-permanent-message]");
        console.log("Permanent messages found:", permanentMessages.length);

        Array.from(permanentMessages).forEach((el, index) => {
            console.log(`Permanent message ${index}:`, el.textContent);
        });

        // Check if there are any "Please wait" messages
        const hasWaitMessage = Array.from(permanentMessages).some(
            (el) =>
                el.textContent?.includes("Please wait") ||
                el.textContent?.includes("save") ||
                el.textContent?.includes("Save"),
        );
        console.log("Has wait message:", hasWaitMessage);

        console.log("✓ Save completion waiting test completed");
        return {
            isHandlingSave,
            permanentMessagesCount: permanentMessages.length,
            hasWaitMessage,
        };
    } catch (error) {
        console.error("Save completion waiting test failed:", error);
    }
};

// prettier-ignore
new AppBuilder()
    .useIndexedDB()
    .useWasmOcc()
    .useThree()
    .useUI()
    .build()
    .then(x => {
        document.body.removeChild(loading)
    })
    .catch((err) => {
        Logger.error(err);
    });
