import { command, IApplication, ICommand, IDocument, INode } from "chili-core";
import { GLBGenerator } from "../../utils/glbGenerator";

@command({
    name: "file.export",
    display: "command.export",
    icon: "icon-save",
})
export class GenerateGLB implements ICommand {
    async execute(app: IApplication): Promise<void> {
        if (!app.activeView?.document) return;

        try {
            // Get face data from the document
            const faceData = this.getFaceDataFromDocument(app.activeView.document);

            // Generate GLB
            const glbData = await GLBGenerator.generateGLB(faceData);

            // Create a blob and download
            const blob = new Blob([glbData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "model.glb";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error generating GLB:", error);
        }
    }

    private getFaceDataFromDocument(document: IDocument): any[] {
        const faces: any[] = [];
        const processNode = (node: INode) => {
            if (node.name.startsWith("Face")) {
                faces.push({
                    id: node.id,
                    name: node.name,
                });
            }
            if (INode.isLinkedListNode(node)) {
                let child = node.firstChild;
                while (child) {
                    processNode(child);
                    child = child.nextSibling;
                }
            }
        };
        processNode(document.rootNode);
        return faces;
    }
}
