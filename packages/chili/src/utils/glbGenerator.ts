import {
    BufferGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Mesh,
    MeshLambertMaterial,
    Scene,
    Uint32BufferAttribute,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";

export class GLBGenerator {
    static async generateGLB(faceData: any[]): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            try {
                // Create a scene
                const scene = new Scene();
                scene.name = "AuxScene";

                // Create base material
                const baseMaterial = new MeshLambertMaterial({
                    color: 0x373737,
                    side: DoubleSide,
                });

                // Create face nodes and meshes
                for (let i = 0; i < faceData.length; i++) {
                    const face = faceData[i];
                    const faceId = (i + 1).toString();
                    const faceName = `Face ${i + 1}`;
                    const faceUUID = faceId;

                    if (face.positions && face.normals && face.indices) {
                        // Create geometry for this face
                        const geometry = new BufferGeometry();

                        // Add position data
                        const positionAttribute = new Float32BufferAttribute(face.positions, 3);
                        geometry.setAttribute("position", positionAttribute);

                        // Add normal data
                        const normalAttribute = new Float32BufferAttribute(face.normals, 3);
                        geometry.setAttribute("normal", normalAttribute);

                        // Add index data
                        const indexAttribute = new Uint32BufferAttribute(face.indices, 1);
                        geometry.setIndex(indexAttribute);

                        // Create mesh
                        const mesh = new Mesh(geometry, baseMaterial);
                        mesh.name = faceName;
                        mesh.userData = {
                            id: faceId,
                            type: face.type,
                            parentId: face.parentId,
                        };

                        // Add to scene
                        scene.add(mesh);
                    }
                }

                // Export to GLB
                const exporter = new GLTFExporter();
                exporter.parse(
                    scene,
                    (gltf) => {
                        // Convert the GLTF data to a string
                        const jsonString = JSON.stringify(gltf);
                        const encoder = new TextEncoder();
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
                console.error("Error in GLB generation:", error);
                reject(error);
            }
        });
    }
}
