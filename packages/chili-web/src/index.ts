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
            console.error("Cannot send response: event.source is not a Window");
        }
    } catch (error) {
        console.error("Error sending response to parent:", error);
    }
}

// Command handler
function handleCommandMessage(event: MessageEvent) {
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

                // Trigger the save command using the existing PubSub system
                console.log("Saving document...");
                PubSub.default.pub("executeCommand", "doc.save");
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
        // Save was successful - send completion response to parent
        pendingSaveOperations.forEach((operation, commandId) => {
            const completionResponse: CommandResponse = {
                type: "COMMAND_RESPONSE",
                command: "SAVE_AND_CLOSE",
                status: "completed",
                result: "success",
                timestamp: Date.now(),
            };
            console.log("Sending completion response to parent:", completionResponse);
            sendResponseToParent(operation.event, completionResponse);

            // Clean up
            pendingSaveOperations.delete(commandId);
        });
    } else if (message === "toast.fail") {
        // Save failed - send completion response to parent
        pendingSaveOperations.forEach((operation, commandId) => {
            const completionResponse: CommandResponse = {
                type: "COMMAND_RESPONSE",
                command: "SAVE_AND_CLOSE",
                status: "completed",
                result: "error",
                timestamp: Date.now(),
            };
            console.log("Sending completion response to parent:", completionResponse);
            sendResponseToParent(operation.event, completionResponse);

            // Clean up
            pendingSaveOperations.delete(commandId);
        });
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
