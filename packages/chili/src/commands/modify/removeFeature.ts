// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    EditableShapeNode,
    IFace,
    ShapeNode,
    ShapeType,
    Transaction,
    VisualState,
    command,
} from "chili-core";
import { SelectShapeStep } from "../../step/selectStep";
import { MultistepCommand } from "../multistepCommand";

@command({
    name: "modify.removeFeature",
    display: "command.removeFeature",
    icon: "icon-removeFeature",
})
export class RemoveFaceCommand extends MultistepCommand {
    protected override async executeMainTask() {
        // Get current projectJson from localStorage
        const currentProjectJson = localStorage.getItem("projectJson");
        if (!currentProjectJson) {
            console.error("No projectJson found in localStorage");
            return;
        }

        const projectData = JSON.parse(currentProjectJson);
        const faces = this.stepDatas.at(-1)!.shapes.map((x) => x.shape as IFace);

        console.log("Selected faces:", faces);
        console.log("Project data:", projectData);
        console.log("All groups in project:", projectData.groups);
        console.log("All faces in project:", projectData.faces);

        // Check each face for group membership
        for (const face of faces) {
            // Get the face node
            const faceNode = this.stepDatas.at(-1)!.shapes.find((x) => x.shape === face)?.owner;

            console.log("Processing face:", face);
            console.log("Face node:", faceNode);
            console.log("Face node geometry:", faceNode?.geometryNode);
            console.log("Face node geometry name:", faceNode?.geometryNode?.name);

            if (!faceNode) {
                console.warn("Could not find face node, skipping group check");
                continue;
            }

            // Find the face in projectData.faces by name
            const faceInProject = projectData.faces.find((f: any) => {
                console.log(
                    `Comparing face name "${f.name}" with geometry node name "${faceNode.geometryNode.name}"`,
                );
                return f.name === faceNode.geometryNode.name;
            });

            if (!faceInProject) {
                console.warn(`Could not find face ${faceNode.geometryNode.name} in project data`);
                console.log(
                    "Available face names in project:",
                    projectData.faces.map((f: any) => f.name),
                );
                continue;
            }

            console.log("Found face in project data:", faceInProject);

            // Find groups that contain this face, excluding 'Default Boundary'
            const groupsWithFace = projectData.groups.filter((group: any) => {
                console.log(`Checking group ${group.name} with faceIds:`, group.faceIds);
                // Skip 'Default Boundary' group
                if (group.name === "Default Boundary") {
                    console.log("Skipping Default Boundary group");
                    return false;
                }
                const hasFace = group.faceIds.includes(faceInProject.id);
                console.log(`Group ${group.name} has face ${faceInProject.id}:`, hasFace);
                return hasFace;
            });

            console.log("Groups with face:", groupsWithFace);

            if (groupsWithFace.length > 0) {
                // Create message showing the group name
                const groupName = groupsWithFace[0].name; // Show only the first group name
                const message = `This face is part of ${groupName}. Do you want to remove it?`;

                console.log("Showing confirmation dialog with message:", message);

                // Show confirmation dialog using standard browser confirm
                const confirmed = window.confirm(message);

                console.log("User confirmed:", confirmed);

                if (!confirmed) {
                    // If user cancels, abort the entire deletion operation
                    return;
                }

                // Remove face from groups
                for (const group of groupsWithFace) {
                    group.faceIds = group.faceIds.filter((id: string) => id !== faceInProject.id);
                }
            } else {
                console.log("No groups found containing this face (excluding Default Boundary)");
            }
        }

        // Update localStorage with modified projectJson
        localStorage.setItem("projectJson", JSON.stringify(projectData));

        // Execute the face removal
        Transaction.execute(this.document, `excute ${Object.getPrototypeOf(this).data.name}`, () => {
            const node = this.stepDatas[0].shapes[0].owner.geometryNode as ShapeNode;
            const filetShape = this.document.application.shapeFactory.removeFeature(node.shape.value, faces);

            const model = new EditableShapeNode(this.document, node.name, filetShape, node.materialId);
            model.transform = node.transform;

            this.document.addNode(model);
            node.parent?.remove(node);
            this.document.visual.update();
        });
    }

    protected override getSteps() {
        return [
            new SelectShapeStep(ShapeType.Shape, "prompt.select.shape", {
                filter: {
                    allow: (shape) => {
                        return (
                            shape.shapeType === ShapeType.Solid ||
                            shape.shapeType === ShapeType.Compound ||
                            shape.shapeType === ShapeType.CompoundSolid
                        );
                    },
                },
                selectedState: VisualState.faceTransparent,
            }),
            new SelectShapeStep(ShapeType.Face, "prompt.select.faces", {
                multiple: true,
                keepSelection: true,
            }),
        ];
    }
}
