// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { IApplication, ICommand, INode, ShapeNode, Transaction, command } from "chili-core";

@command({
    name: "visibility.showAllFaces",
    display: "command.showAllFaces",
    icon: "icon-show",
})
export class ShowAllFaces implements ICommand {
    async execute(app: IApplication): Promise<void> {
        console.log("[DEBUG] ShowAllFaces command executing");
        const view = app.activeView;
        if (!view) {
            console.log("[DEBUG] No active view");
            return;
        }

        // Find all hidden faces in the document
        const hiddenFaces: ShapeNode[] = [];
        const findHiddenFaces = (node: INode) => {
            // Check for any type of shape node that might be hidden
            const isShapeNode =
                node instanceof ShapeNode ||
                node.constructor.name === "EditableShapeNode" ||
                node.constructor.name.includes("Shape");

            if (isShapeNode && !node.visible) {
                hiddenFaces.push(node as ShapeNode);
                console.log("[DEBUG] Found hidden face:", node);
            }
            if ((node as any).firstChild) {
                let child = (node as any).firstChild;
                while (child) {
                    findHiddenFaces(child);
                    child = child.nextSibling;
                }
            }
        };

        findHiddenFaces(view.document.rootNode);
        console.log("[DEBUG] Hidden faces found:", hiddenFaces.length);

        if (hiddenFaces.length === 0) {
            console.warn("No hidden faces found");
            return;
        }

        // Show each hidden face using the same logic as the eye icon
        Transaction.execute(view.document, "show all faces", () => {
            hiddenFaces.forEach((node, index) => {
                console.log(`[DEBUG] Showing face ${index}:`, node);
                node.visible = true;
                console.log(`[DEBUG] Set face ${index} visible to true`);
            });
        });

        console.log("[DEBUG] ShowAllFaces command completed");
    }
}
