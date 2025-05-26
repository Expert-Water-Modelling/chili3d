// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios from "axios";
import { command, gc, IApplication, ICommand, IDocument, INode, PubSub, ShapeNode } from "chili-core";

declare const wasm: any;

// Define the environment variable type
declare global {
    interface ProcessEnv {
        API_URL?: string;
    }
}

@command({
    name: "doc.send",
    display: "command.document.send",
    icon: "icon-export",
})
export class SendDocument implements ICommand {
    // Define the API base URL as a constant
    private readonly API_BASE_URL = "http://37.59.205.2:8000";

    async execute(app: IApplication): Promise<void> {
        if (!app.activeView?.document) return;

        try {
            // Get project ID and user ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get("id");
            const userId = urlParams.get("user_id");

            console.log("URL Parameters:", {
                projectId,
                userId,
                fullUrl: window.location.href,
            });

            if (!projectId || !userId) {
                throw new Error(`Missing required parameters. Project ID: ${projectId}, User ID: ${userId}`);
            }

            // Get all folders and their faces
            const folders = this.getFolders(app.activeView.document);
            console.log("Found folders:", folders);

            if (folders.size === 0) {
                throw new Error("No folders found in the document");
            }

            const mergedShapes = new Map<string, any>();
            const folderStlMapping: Array<{ name: string; filename: string; type: string }> = [];

            // Process each folder
            for (const [folderId, faces] of folders) {
                if (faces.length === 0) {
                    console.log(`Skipping empty folder: ${folderId}`);
                    continue;
                }

                // Get the folder node to access its name
                let folderNode: INode | null = null;
                const findNode = (node: INode): INode | null => {
                    if (node.id === folderId) return node;
                    if (INode.isLinkedListNode(node)) {
                        let child = (node as any).firstChild;
                        while (child) {
                            const found = findNode(child);
                            if (found) return found;
                            child = child.nextSibling;
                        }
                    }
                    return null;
                };
                folderNode = findNode(app.activeView.document.rootNode);

                if (!folderNode) {
                    console.warn(`Folder node not found for ID: ${folderId}`);
                    continue;
                }

                const folderName = folderNode.name || "Unnamed Folder";
                console.log(`Processing folder: ${folderName} (${folderId})`);

                try {
                    // Create a shell from the faces
                    const shellResult = app.shapeFactory.shell(faces);
                    if (!shellResult.isOk) {
                        console.error(`Shell creation failed for ${folderName}:`, shellResult.error);
                        continue;
                    }

                    // Create a solid from the shell
                    const solidResult = app.shapeFactory.solid([shellResult.value]);
                    if (!solidResult.isOk) {
                        console.error(`Solid creation failed for ${folderName}:`, solidResult.error);
                        continue;
                    }

                    mergedShapes.set(folderName, solidResult.value);
                    const boundaryType =
                        (app.activeView.document as any).boundaryTypes.get(folderId) || "wall";
                    folderStlMapping.push({
                        name: folderName,
                        filename: `${folderName}.stl`,
                        type: boundaryType,
                    });
                } catch (error) {
                    console.error(`Error processing folder ${folderName}:`, error);
                    continue;
                }
            }

            if (mergedShapes.size === 0) {
                throw new Error("No valid shapes were created from the folders");
            }

            // Create FormData for STL files
            const stlFormData = new FormData();

            // Add all STL files to FormData
            for (const [folderName, shape] of mergedShapes) {
                try {
                    const stlData = await this.convertToSTL(shape);
                    const blob = new Blob([stlData], { type: "application/octet-stream" });
                    stlFormData.append("files", blob, `${folderName}.stl`);
                    console.log(`Added STL file for folder: ${folderName}`);
                } catch (error) {
                    console.error(`Error converting folder ${folderName} to STL:`, error);
                }
            }

            // Send STL files to the STL upload endpoint
            const stlApiUrl = `${this.API_BASE_URL}/upload_stl_files/${userId}/${projectId}`;
            console.log("Sending STL files to API:", stlApiUrl);

            const stlResponse = await axios.post(stlApiUrl, stlFormData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    accept: "application/json",
                },
            });

            console.log("STL Files API Response:", stlResponse.data);

            // Create FormData for JSON file
            const jsonFormData = new FormData();
            const jsonBlob = new Blob([JSON.stringify(folderStlMapping, null, 2)], {
                type: "application/json",
            });
            jsonFormData.append("file", jsonBlob, "main.json");
            console.log("Added mapping JSON file");

            // Send JSON file to the project files endpoint
            const jsonApiUrl = `${this.API_BASE_URL}/upload_project_files/${userId}/${projectId}`;
            console.log("Sending JSON file to API:", jsonApiUrl);

            const jsonResponse = await axios.post(jsonApiUrl, jsonFormData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    accept: "application/json",
                },
            });

            console.log("JSON File API Response:", jsonResponse.data);
            PubSub.default.pub("showToast", "toast.document.sent");
        } catch (error) {
            console.error("Send document error:", error);
            if (axios.isAxiosError(error)) {
                console.error("API Error:", {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                });
            }
            PubSub.default.pub("showToast", "toast.fail");
        }
    }

    private getFolders(document: IDocument): Map<string, any[]> {
        const folders = new Map<string, any[]>();
        const rootNode = document.rootNode;
        console.log("Starting folder processing with root node:", rootNode);

        const processNode = (node: INode, currentFolder: string) => {
            console.log("Processing node:", {
                id: node.id,
                name: node.name,
                type: node.constructor.name,
                currentFolder,
            });

            if (INode.isLinkedListNode(node)) {
                // This is a folder
                const folderName = node.name || "Unnamed Folder";
                console.log(`Found folder: ${folderName} (${node.id})`);
                folders.set(node.id, []);

                // Process children
                let child = (node as any).firstChild;
                while (child) {
                    processNode(child, node.id);
                    child = child.nextSibling;
                }
            } else if (node instanceof ShapeNode) {
                // This is a shape node
                console.log(`Found shape node in folder ${currentFolder}:`, {
                    id: node.id,
                    name: node.name,
                    hasShape: node.shape.isOk,
                });
                const faces = folders.get(currentFolder) || [];
                if (node.shape.isOk) {
                    faces.push(node.shape.value);
                    console.log(`Added face to folder ${currentFolder}`);
                } else {
                    console.warn(`Shape node ${node.id} has no valid shape`);
                }
                folders.set(currentFolder, faces);
            }
        };

        processNode(rootNode, "Root");
        console.log(
            "Final folders map:",
            Array.from(folders.entries()).map(([id, faces]) => ({
                id,
                faceCount: faces.length,
            })),
        );
        return folders;
    }

    private async convertToSTL(shape: any): Promise<ArrayBuffer> {
        return gc((c) => {
            // Create a mesher instance with the shape
            const occMesher = c(new wasm.Mesher(shape.shape, 0.1)); // Use 0.1 as the linear deflection for good quality

            // Get the mesh data
            const meshData = c(occMesher.mesh());
            const faceMeshData = c(meshData.faceMeshData);

            // Convert mesh data to STL format
            const stlData = this.meshToSTL(faceMeshData);

            return stlData;
        });
    }

    private meshToSTL(faceMeshData: any): ArrayBuffer {
        // STL format:
        // UINT8[80]    – Header
        // UINT32       – Number of triangles
        // foreach triangle
        //   REAL32[3]  – Normal vector
        //   REAL32[3]  – Vertex 1
        //   REAL32[3]  – Vertex 2
        //   REAL32[3]  – Vertex 3
        //   UINT16     – Attribute byte count

        const triangleCount = faceMeshData.index.length / 3;
        const bufferSize = 80 + 4 + 50 * triangleCount; // 50 = 4 * 12 + 2 (normal + 3 vertices + attribute)
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Write header (80 bytes)
        const encoder = new TextEncoder();
        const header = encoder.encode("Binary STL file generated by Chili3D");
        for (let i = 0; i < 80; i++) {
            view.setUint8(offset++, i < header.length ? header[i] : 0);
        }

        // Write number of triangles
        view.setUint32(offset, triangleCount, true);
        offset += 4;

        // Write triangles
        for (let i = 0; i < triangleCount; i++) {
            const i1 = faceMeshData.index[i * 3];
            const i2 = faceMeshData.index[i * 3 + 1];
            const i3 = faceMeshData.index[i * 3 + 2];

            // Write normal
            const nx = faceMeshData.normal[i1 * 3];
            const ny = faceMeshData.normal[i1 * 3 + 1];
            const nz = faceMeshData.normal[i1 * 3 + 2];
            view.setFloat32(offset, nx, true);
            view.setFloat32(offset + 4, ny, true);
            view.setFloat32(offset + 8, nz, true);
            offset += 12;

            // Write vertices
            const writeVertex = (index: number) => {
                const x = faceMeshData.position[index * 3];
                const y = faceMeshData.position[index * 3 + 1];
                const z = faceMeshData.position[index * 3 + 2];
                view.setFloat32(offset, x, true);
                view.setFloat32(offset + 4, y, true);
                view.setFloat32(offset + 8, z, true);
                offset += 12;
            };

            writeVertex(i1);
            writeVertex(i2);
            writeVertex(i3);

            // Write attribute byte count (0)
            view.setUint16(offset, 0, true);
            offset += 2;
        }

        return buffer;
    }
}
