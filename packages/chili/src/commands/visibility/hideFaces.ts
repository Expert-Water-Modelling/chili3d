// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { IApplication, ICommand, ShapeNode, Transaction, command } from "chili-core";

@command({
    name: "visibility.hideFaces",
    display: "command.hideFaces",
    icon: "icon-hide",
})
export class HideFaces implements ICommand {
    async execute(app: IApplication): Promise<void> {
        console.log("[DEBUG] HideFaces command executing");
        const view = app.activeView;
        if (!view) {
            console.log("[DEBUG] No active view");
            return;
        }

        const selectedNodes = view.document.selection.getSelectedNodes();
        console.log("[DEBUG] Selected nodes:", selectedNodes);

        // Filter for any type of shape node (ShapeNode, EditableShapeNode, etc.)
        const faceNodes = selectedNodes.filter(
            (node) =>
                node instanceof ShapeNode ||
                node.constructor.name === "EditableShapeNode" ||
                node.constructor.name.includes("Shape"),
        ) as ShapeNode[];
        console.log("[DEBUG] Face nodes to hide:", faceNodes);

        if (faceNodes.length === 0) {
            console.warn("No faces selected to hide");
            return;
        }

        // Hide each selected face using the same logic as the eye icon
        Transaction.execute(view.document, "hide faces", () => {
            faceNodes.forEach((node, index) => {
                console.log(`[DEBUG] Hiding face ${index}:`, node);
                node.visible = false;
                console.log(`[DEBUG] Set face ${index} visible to false`);
            });
        });

        console.log("[DEBUG] HideFaces command completed");
    }
}
