// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, I18n, IApplication, ICommand, PubSub } from "chili-core";

@command({
    name: "doc.reset",
    display: "command.document.reset",
    icon: "icon-trash",
})
export class ResetDocument implements ICommand {
    async execute(app: IApplication): Promise<void> {
        if (!app.activeView?.document) return;

        const currentName = app.activeView.document.name;

        PubSub.default.pub(
            "showPermanent",
            async () => {
                // Close the current document
                await app.activeView?.document.close();

                // Create a new document with the same name
                const newDocument = await app.newDocument(currentName);

                // Update the view
                if (app.activeView) {
                    app.activeView.update();
                    app.activeView.cameraController.fitContent();
                }

                PubSub.default.pub("showToast", "toast.document.reset");
            },
            "toast.excuting{0}",
            I18n.translate("command.document.reset"),
        );
    }
}
