// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, IApplication, ICommand, PubSub, ShapeNode } from "chili-core";

@command({
    name: "modify.delete",
    display: "command.delete",
    icon: "icon-delete",
})
export class Delete implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (!document) return;

        const nodes = document.selection.getSelectedNodes();
        if (document.currentNode && nodes.includes(document.currentNode)) {
            document.currentNode = document.rootNode;
        }

        // Get current projectJson from localStorage
        const currentProjectJson = localStorage.getItem("projectJson");
        if (!currentProjectJson) {
            console.error("No projectJson found in localStorage");
            return;
        }

        const projectData = JSON.parse(currentProjectJson);

        // Check each node for group membership
        for (const node of nodes) {
            // Only check ShapeNodes that are faces
            if (node instanceof ShapeNode && node.shape.isOk) {
                // Find the face in projectData.faces by name
                const faceInProject = projectData.faces.find((f: any) => f.name === node.name);

                if (faceInProject) {
                    // Find groups that contain this face, excluding 'Default Boundary'
                    const groupsWithFace = projectData.groups.filter((group: any) => {
                        // Skip 'Default Boundary' group
                        if (group.name === "Default Boundary") {
                            return false;
                        }
                        return group.faceIds.includes(faceInProject.id);
                    });

                    if (groupsWithFace.length > 0) {
                        // Create message showing the group name
                        const groupName = groupsWithFace[0].name; // Show only the first group name
                        const message = `This face is part of ${groupName}. Do you want to remove it?`;

                        // Show confirmation dialog using standard browser confirm
                        const confirmed = window.confirm(message);

                        if (!confirmed) {
                            // If user cancels, abort the entire deletion operation
                            return;
                        }

                        // Remove face from groups
                        for (const group of groupsWithFace) {
                            group.faceIds = group.faceIds.filter((id: string) => id !== faceInProject.id);
                        }
                    }
                }
            }
        }

        document.selection.clearSelection();
        nodes.forEach((model) => model.parent?.remove(model));
        document.visual.update();
        PubSub.default.pub("showToast", "toast.delete{0}Objects", nodes.length);

        // Update localStorage with modified projectJson
        localStorage.setItem("projectJson", JSON.stringify(projectData));
    }
}
