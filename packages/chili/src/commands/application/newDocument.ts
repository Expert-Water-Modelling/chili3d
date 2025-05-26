// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, IApplication, ICommand, PubSub, command } from "chili-core";

@command({
    name: "doc.new",
    display: "command.document.new",
    icon: "icon-new",
})
export class NewDocument implements ICommand {
    async execute(app: IApplication): Promise<void> {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                // Get project name from URL
                const urlParams = new URLSearchParams(window.location.search);
                const projectName = urlParams.get("name") || "New Document";

                // Close existing document if any
                if (app.activeView?.document) {
                    await app.activeView.document.close();
                }

                // Create new document
                const document = await app.newDocument(projectName);
                if (!document) {
                    throw new Error("Failed to create new document");
                }

                // Save document to appear in recent documents
                await document.save();

                // Switch to document view
                PubSub.default.pub("displayHome", false);
            },
            "toast.excuting{0}",
            I18n.translate("command.document.new"),
        );
    }
}
