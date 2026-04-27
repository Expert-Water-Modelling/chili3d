// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios from "axios";
import {
    apiService,
    command,
    gc,
    I18n,
    IApplication,
    ICommand,
    IDocument,
    INode,
    IShape,
    PubSub,
    ShapeNode,
} from "chili-core";
import { OccShapeConverter } from "chili-wasm/src/converter";
import { OccShape } from "chili-wasm/src/shape";
import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Mesh,
    MeshLambertMaterial,
    Scene,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";
import { GLBGenerator } from "../../utils/glbGenerator";

declare const wasm: any;

@command({
    name: "doc.save",
    display: "command.document.save",
    icon: "icon-save",
})
export class SaveDocument implements ICommand {
    async execute(app: IApplication): Promise<void> {
        if (!app.activeView?.document) return;

        PubSub.default.pub(
            "showPermanent",
            async () => {
                try {
                    // Get project ID and user ID from URL
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get("id");
                    const userId = urlParams.get("user_id");

                    if (!projectId || !userId) {
                        throw new Error(
                            `Missing required parameters. Project ID: ${projectId}, User ID: ${userId}`,
                        );
                    }

                    // Since we checked at the start of the function, we can use non-null assertion
                    const document = app.activeView!.document!;

                    // Remove deleted faces from projectJson
                    await this.removeDeletedFacesFromProjectJson(document);

                    // Update projectJson with new faces
                    await this.updateProjectJsonWithNewFaces(document);

                    // Get the updated projectJson from localStorage
                    const projectJson = localStorage.getItem("projectJson");
                    if (projectJson) {
                        // Create a timestamp for cache busting
                        const timestamp = Date.now();

                        // Create FormData for project.json
                        const projectFormData = new FormData();
                        const projectBlob = new Blob([projectJson], { type: "application/json" });
                        projectFormData.append("file", projectBlob, "project.json");

                        // Upload project.json
                        const projectApiUrl = `/upload_project_files/${userId}/${projectId}?t=${timestamp}`;
                        console.log("Uploading project.json to API:", projectApiUrl);

                        const projectResponse = await apiService.post(projectApiUrl, projectFormData, {
                            headers: {
                                "Content-Type": "multipart/form-data",
                                accept: "application/json",
                            },
                        });

                        console.log("Project.json uploaded successfully:", projectResponse.data);
                    }

                    // Serialize document data
                    const documentData = document.serialize();
                    const formData = new FormData();
                    formData.append(
                        "file",
                        new Blob([JSON.stringify(documentData)], { type: "application/json" }),
                        "document.json",
                    );

                    // Send project data to the server
                    const apiUrl = `/upload_project_files/${userId}/${projectId}`;
                    console.log("Saving project data to API:", apiUrl);

                    const response = await apiService.post(apiUrl, formData, {
                        headers: {
                            "Content-Type": "multipart/form-data",
                            accept: "application/json",
                        },
                    });

                    console.log("Project data saved successfully:", response.data);
                    PubSub.default.pub("showToast", "toast.document.saved");

                    // Convert shapes to STEP format
                    const shapes: IShape[] = [];
                    const processedNodes = new Set<string>();
                    const collectShapes = (node: INode) => {
                        // Skip if we've already processed this node
                        if (processedNodes.has(node.id)) {
                            return;
                        }
                        processedNodes.add(node.id);

                        if (node instanceof ShapeNode && node.shape.isOk) {
                            const shape = node.shape.value;
                            if (shape instanceof OccShape) {
                                // Add the entire shape instead of individual faces
                                console.log(`Adding shape from node ${node.name}`);
                                shapes.push(shape);
                            }
                        }

                        // Process children
                        if (INode.isLinkedListNode(node)) {
                            let child = node.firstChild;
                            while (child) {
                                collectShapes(child);
                                child = child.nextSibling;
                            }
                        }
                    };

                    // Start collection from root node
                    collectShapes(document.rootNode);
                    console.log(`Total shapes collected: ${shapes.length}`);

                    if (shapes.length > 0) {
                        const converter = new OccShapeConverter();
                        const stepResult = converter.convertToSTEP(...shapes);

                        if (stepResult.isOk) {
                            // Convert the STEP string to a Uint8Array
                            const encoder = new TextEncoder();
                            const stepData = encoder.encode(stepResult.value);
                            const stepBlob = new Blob([stepData], { type: "application/step" });
                            const stepFormData = new FormData();
                            stepFormData.append("file", stepBlob, "model.step");

                            // Upload STEP file
                            const stepApiUrl = `/upload_project_files/${userId}/${projectId}`;
                            console.log("Sending STEP file to API:", stepApiUrl);

                            const stepResponse = await apiService.post(stepApiUrl, stepFormData, {
                                headers: {
                                    "Content-Type": "multipart/form-data",
                                    accept: "application/json",
                                },
                            });

                            console.log("STEP File API Response:", stepResponse.data);
                            PubSub.default.pub("showToast", "toast.document.sent");
                        } else {
                            console.error("Failed to convert shapes to STEP:", stepResult.error);
                            PubSub.default.pub("showToast", "toast.fail");
                        }
                    }

                    // Generate and upload GLB file
                    try {
                        // Get face data from the document
                        const faceData = await this.getFaceDataFromDocument(document);
                        console.log("Face data for GLB:", faceData);

                        // Generate GLB using our new generator
                        const glbData = await GLBGenerator.generateGLB(faceData);
                        console.log("GLB generation completed, data size:", glbData.byteLength);

                        // Create FormData for GLB file
                        const glbFormData = new FormData();
                        const glbBlob = new Blob([glbData], { type: "model/gltf-binary" });
                        glbFormData.append("file", glbBlob, "model.glb");

                        // Upload GLB file
                        const glbApiUrl = `/upload_project_files/${userId}/${projectId}`;
                        console.log("Sending GLB file to API:", glbApiUrl);

                        const glbResponse = await apiService.post(glbApiUrl, glbFormData, {
                            headers: {
                                "Content-Type": "multipart/form-data",
                                accept: "application/json",
                            },
                        });

                        console.log("GLB File API Response:", glbResponse.data);
                        PubSub.default.pub("showToast", "toast.document.sent");
                    } catch (error) {
                        console.error("GLB generation/upload error:", error);
                        if (axios.isAxiosError(error)) {
                            console.error("API Error:", {
                                status: error.response?.status,
                                data: error.response?.data,
                                message: error.message,
                            });
                        }
                        PubSub.default.pub("showToast", "toast.fail");
                    }
                } catch (error) {
                    console.error("Save document error:", error);
                    if (axios.isAxiosError(error)) {
                        console.error("API Error:", {
                            status: error.response?.status,
                            data: error.response?.data,
                            message: error.message,
                        });
                    }
                    PubSub.default.pub("showToast", "toast.fail");
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.document.save"),
        );
    }

    private getFolders(document: IDocument): Map<string, any[]> {
        const folders = new Map<string, any[]>();
        const rootNode = document.rootNode;
        console.log("Starting folder processing with root node:", rootNode);

        const processNode = (node: INode, parentFolderId: string | null) => {
            console.log("Processing node:", {
                id: node.id,
                name: node.name,
                type: node.constructor.name,
                parentFolderId,
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
            } else if (node instanceof ShapeNode && parentFolderId) {
                // This is a shape node
                console.log(`Found shape node in folder ${parentFolderId}:`, {
                    id: node.id,
                    name: node.name,
                    hasShape: node.shape.isOk,
                });
                const faces = folders.get(parentFolderId) || [];
                if (node.shape.isOk) {
                    faces.push(node.shape.value);
                    console.log(`Added face to folder ${parentFolderId}`);
                } else {
                    console.warn(`Shape node ${node.id} has no valid shape`);
                }
                folders.set(parentFolderId, faces);
            }
        };

        processNode(rootNode, null);
        return folders;
    }

    private findNode(node: INode, targetId: string): INode | null {
        if (node.id === targetId) return node;
        if (INode.isLinkedListNode(node)) {
            let child = (node as any).firstChild;
            while (child) {
                const found = this.findNode(child, targetId);
                if (found) return found;
                child = child.nextSibling;
            }
        }
        return null;
    }

    private async convertToSTL(shape: any): Promise<ArrayBuffer> {
        return new Promise((resolve) => {
            gc((c) => {
                // Create a mesher instance with the shape
                const occMesher = c(new wasm.Mesher(shape.shape, 0.1)); // Use 0.1 as the linear deflection for good quality

                // Get the mesh data
                const meshData = c(occMesher.mesh());
                const faceMeshData = c(meshData.faceMeshData);

                // Convert mesh data to STL format
                const stlData = this.meshToSTL(faceMeshData);

                resolve(stlData);
            });
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

    private async convertToGLB(shape: any, document: IDocument): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            gc((c) => {
                try {
                    console.log("Starting GLB conversion process");
                    // Create a mesher instance with the shape
                    const occMesher = c(new wasm.Mesher(shape.shape, 0.1));
                    const meshData = c(occMesher.mesh());
                    const faceMeshData = c(meshData.faceMeshData);

                    console.log("Mesh data created, creating Three.js geometry");
                    // Create Three.js geometry and mesh
                    const geometry = new BufferGeometry();

                    // Ensure arrays are properly typed
                    const positions = new Float32Array(faceMeshData.position);
                    const normals = new Float32Array(faceMeshData.normal);
                    const indices = new Uint32Array(faceMeshData.index);

                    // Get face data from the document
                    const faceData = this.getFaceDataFromDocument(document);
                    console.log("Face data from document:", faceData);

                    // Add face attributes to the geometry
                    const faceAttributes = new Float32Array(faceMeshData.index.length);
                    for (let i = 0; i < faceMeshData.index.length; i += 3) {
                        const faceId = i / 3;
                        faceAttributes[i] = faceId;
                        faceAttributes[i + 1] = faceId;
                        faceAttributes[i + 2] = faceId;
                    }
                    geometry.setAttribute("faceId", new Float32BufferAttribute(faceAttributes, 1));

                    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
                    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
                    geometry.setIndex(new BufferAttribute(indices, 1));

                    const material = new MeshLambertMaterial({ side: DoubleSide });
                    const mesh = new Mesh(geometry, material);
                    mesh.userData["faceData"] = {
                        totalFaces: indices.length / 3,
                        faceAttributes: Array.from(faceAttributes),
                        vertexIndices: Array.from(indices),
                        documentFaces: faceData,
                    };

                    // Create a scene and add the mesh
                    const scene = new Scene();
                    scene.add(mesh);

                    console.log("Scene created, starting GLB export");
                    // Export to GLB
                    const exporter = new GLTFExporter();
                    exporter.parse(
                        scene,
                        (glb) => {
                            console.log("GLB export completed successfully");
                            // Set the generator version
                            const glbData = glb as {
                                asset: { generator: string };
                                meshes: Array<{
                                    primitives: Array<{
                                        attributes: { [key: string]: number };
                                        indices: number;
                                        material: number;
                                    }>;
                                    extras?: any;
                                }>;
                                accessors: Array<{
                                    bufferView: number;
                                    componentType: number;
                                    count: number;
                                    type: string;
                                    min?: number[];
                                    max?: number[];
                                }>;
                                bufferViews: Array<{
                                    buffer: number;
                                    byteOffset: number;
                                    byteLength: number;
                                    target?: number;
                                }>;
                                buffers: Array<{
                                    byteLength: number;
                                    uri: string;
                                }>;
                            };

                            glbData.asset.generator = "THREE.GLTFExporter r164";

                            // Convert binary data to human-readable format
                            if (glbData.buffers && glbData.buffers.length > 0) {
                                glbData.buffers.forEach((buffer, index) => {
                                    if (buffer.uri && buffer.uri.startsWith("data:")) {
                                        // Extract the base64 data
                                        const base64Data = buffer.uri.split(",")[1];
                                        // Convert base64 to array of numbers
                                        const binaryData = atob(base64Data);
                                        const numbers = new Array(binaryData.length);
                                        for (let i = 0; i < binaryData.length; i++) {
                                            numbers[i] = binaryData.charCodeAt(i);
                                        }
                                        // Replace the binary data with the array of numbers
                                        buffer.uri = JSON.stringify(numbers);
                                    }
                                });
                            }

                            // Ensure mesh data is included in the JSON structure
                            if (glbData.meshes && glbData.meshes.length > 0) {
                                const mesh = glbData.meshes[0];
                                if (mesh.primitives && mesh.primitives.length > 0) {
                                    const primitive = mesh.primitives[0];
                                    // Ensure position, normal, and face attributes are present
                                    if (
                                        !primitive.attributes["POSITION"] ||
                                        !primitive.attributes["NORMAL"] ||
                                        !primitive.attributes["faceId"]
                                    ) {
                                        console.warn("Missing required attributes in mesh");
                                    }

                                    // Add face data to the mesh's extras
                                    if (!mesh.extras) {
                                        mesh.extras = {};
                                    }
                                    mesh.extras.documentFaces = faceData;
                                }
                            }

                            // Convert the JSON string to ArrayBuffer
                            const encoder = new TextEncoder();
                            const jsonString = JSON.stringify(glbData, null, 2); // Pretty print the JSON
                            const uint8Array = encoder.encode(jsonString);
                            const buffer = new ArrayBuffer(uint8Array.length);
                            new Uint8Array(buffer).set(uint8Array);
                            resolve(buffer);
                        },
                        (error) => {
                            console.error("GLB export error:", error);
                            reject(error);
                        },
                        {
                            binary: false,
                            embedImages: false,
                            includeCustomExtensions: true,
                            onlyVisible: true,
                            maxTextureSize: 4096,
                            animations: [],
                            trs: true,
                        },
                    );
                } catch (error) {
                    console.error("Error in GLB conversion:", error);
                    reject(error);
                }
            });
        });
    }

    private async getFaceDataFromDocument(document: IDocument): Promise<any[]> {
        const faces: any[] = [];
        let faceCounter = 1;

        const processNode = async (node: INode) => {
            if (node instanceof ShapeNode) {
                if (node.shape.isOk) {
                    // Get mesh data from the shape
                    const shape = node.shape.value;
                    const meshData = await this.getMeshDataFromShape(shape);

                    // Use sequential numbering for face names
                    const faceName = `Face ${faceCounter}`;
                    faces.push({
                        id: faceCounter.toString(),
                        name: faceName,
                        type: node.constructor.name,
                        parentId: node.parent?.id,
                        positions: meshData.positions,
                        normals: meshData.normals,
                        indices: meshData.indices,
                    });
                    faceCounter++;
                }
            }
            if (INode.isLinkedListNode(node)) {
                let child = (node as any).firstChild;
                while (child) {
                    await processNode(child);
                    child = child.nextSibling;
                }
            }
        };
        await processNode(document.rootNode);
        return faces;
    }

    private getMeshDataFromShape(
        shape: any,
    ): Promise<{ positions: number[]; normals: number[]; indices: number[] }> {
        return new Promise((resolve) => {
            gc((c) => {
                // Create a mesher instance with the shape
                const occMesher = c(new wasm.Mesher(shape.shape, 0.1));
                const meshData = c(occMesher.mesh());
                const faceMeshData = c(meshData.faceMeshData);

                resolve({
                    positions: Array.from(faceMeshData.position),
                    normals: Array.from(faceMeshData.normal),
                    indices: Array.from(faceMeshData.index),
                });
            });
        });
    }

    private async updateProjectJsonWithNewFaces(document: IDocument): Promise<void> {
        try {
            // Get current projectJson from localStorage
            const currentProjectJson = localStorage.getItem("projectJson");
            if (!currentProjectJson) {
                console.error("No projectJson found in localStorage");
                return;
            }

            const projectData = JSON.parse(currentProjectJson);

            // Get current faces from document
            const currentFaces = await this.getFaceDataFromDocument(document);

            // Create a map of existing faces by name for quick lookup
            const existingFacesByName = new Map(projectData.faces.map((face: any) => [face.name, face]));

            // Track which faces we've processed to avoid duplicates
            const processedFaceNames = new Set<string>();

            // Filter and update faces
            const updatedFaces = projectData.faces.filter((face: any) => {
                // If we've already processed this face name, skip it
                if (processedFaceNames.has(face.name)) {
                    return false;
                }
                processedFaceNames.add(face.name);
                return true;
            });

            // Add new faces that don't exist in projectJson
            currentFaces.forEach((face) => {
                if (!existingFacesByName.has(face.name)) {
                    // Generate a unique ID for the new face
                    const newFace = {
                        ...face,
                        id: crypto.randomUUID(),
                        groupId: projectData.groups[0]?.id || null, // Add to first group or null if no groups
                        visible: true,
                    };
                    updatedFaces.push(newFace);
                    console.log(`Added new face: ${newFace.name} with ID: ${newFace.id}`);
                }
            });

            // Update projectJson with deduplicated and new faces
            projectData.faces = updatedFaces;

            // Update localStorage with new projectJson
            localStorage.setItem("projectJson", JSON.stringify(projectData));
            console.log(`Updated projectJson with ${updatedFaces.length} faces`);

            // Get project ID and user ID from URL
            const urlParams = new URLSearchParams(window.location.search);
        } catch (error) {
            console.error("Error updating projectJson with new faces:", error);
        }
    }

    private async removeDeletedFacesFromProjectJson(document: IDocument): Promise<void> {
        try {
            // Get current projectJson from localStorage
            const currentProjectJson = localStorage.getItem("projectJson");
            if (!currentProjectJson) {
                console.error("No projectJson found in localStorage");
                return;
            }

            const projectData = JSON.parse(currentProjectJson);

            // Get current faces from document
            const currentFaces = await this.getFaceDataFromDocument(document);

            // Create a set of current face names for quick lookup
            const currentFaceNames = new Set(currentFaces.map((face) => face.name));

            // Find faces that need to be removed
            const facesToRemove = projectData.faces.filter(
                (face: { name: string; id: string }) => !currentFaceNames.has(face.name),
            );

            // Create a set of face IDs to remove for efficient lookup
            const faceIdsToRemove = new Set(facesToRemove.map((face: { id: string }) => face.id));

            // Update faces array with remaining faces
            const updatedFaces = projectData.faces.filter((face: { name: string }) =>
                currentFaceNames.has(face.name),
            );
            projectData.faces = updatedFaces;

            // Clean up faceIds in all groups
            if (projectData.groups) {
                projectData.groups.forEach((group: any) => {
                    if (group.faceIds) {
                        // Remove deleted face IDs from the group
                        group.faceIds = group.faceIds.filter((id: string) => !faceIdsToRemove.has(id));
                    }
                });
            }

            // Update localStorage with new projectJson
            localStorage.setItem("projectJson", JSON.stringify(projectData));
            console.log(`Updated projectJson after face deletion. Remaining faces: ${updatedFaces.length}`);
        } catch (error) {
            console.error("Error updating projectJson after face deletion:", error);
        }
    }
}
