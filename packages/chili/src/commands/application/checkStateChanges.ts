// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, IApplication, ICommand, PubSub } from "chili-core";

@command({
    name: "app.checkStateChanges",
    display: "app.checkStateChanges",
    icon: "icon-check",
})
export class CheckStateChanges implements ICommand {
    async execute(app: IApplication): Promise<void> {
        try {
            console.log("Checking for state changes...");
            const result = await app.checkForStateChanges();

            console.log("State change check result:", result);

            if (result === "success") {
                // User chose to save and continue
                PubSub.default.pub("showToast", "toast.document.saved");
                // Reset the snapshot after successful save
                app.resetStateSnapshot();
            } else if (result === "no_changes") {
                // No changes detected or user chose to discard
                PubSub.default.pub("showToast", "toast.success");
            }
        } catch (error) {
            console.error("Error checking state changes:", error);
            PubSub.default.pub("showToast", "toast.fail");
        }
    }
}
