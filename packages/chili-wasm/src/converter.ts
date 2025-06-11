// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Deletable,
    EditableShapeNode,
    FolderNode,
    gc,
    GroupNode,
    IDisposable,
    IDocument,
    INode,
    IShape,
    IShapeConverter,
    Material,
    Result,
} from "chili-core";
import { ShapeNode } from "../lib/chili-wasm";
import { OcctHelper } from "./helper";
import { OccShape } from "./shape";

export class OccShapeConverter implements IShapeConverter {
    private readonly addShapeNode = (
        collector: (d: Deletable | IDisposable) => any,
        folder: FolderNode,
        node: ShapeNode,
        children: ShapeNode[],
        getMaterialId: (document: IDocument, color: string) => string,
    ) => {
        if (node.shape) {
            const shape = OcctHelper.wrapShape(node.shape);
            const material = getMaterialId(folder.document, node.color as string);
            folder.add(new EditableShapeNode(folder.document, node.name as string, shape, material));
        }

        children.forEach((child) => {
            collector(child);
            const subChildren = child.getChildren();
            const childFolder =
                subChildren.length > 1 ? new GroupNode(folder.document, child.name as string) : folder;

            if (subChildren.length > 1) {
                folder.add(childFolder);
            }
            this.addShapeNode(collector, childFolder, child, subChildren, getMaterialId);
        });
    };

    convertToIGES(...shapes: IShape[]): Result<string> {
        let occShapes = shapes.map((shape) => {
            if (shape instanceof OccShape) {
                return shape.shape;
            }
            throw new Error("Shape is not an OccShape");
        });
        return Result.ok(wasm.Converter.convertToIges(occShapes));
    }

    convertFromIGES(document: IDocument, iges: Uint8Array): Result<FolderNode> {
        return this.converterFromData(document, iges, wasm.Converter.convertFromIges);
    }

    private readonly converterFromData = (
        document: IDocument,
        data: Uint8Array,
        converter: (data: Uint8Array) => ShapeNode | undefined,
    ) => {
        const materialMap: Map<string, string> = new Map();
        const getMaterialId = (document: IDocument, color: string) => {
            if (!materialMap.has(color)) {
                const material = new Material(document, color, color);
                document.materials.push(material);
                materialMap.set(color, material.id);
            }
            return materialMap.get(color)!;
        };

        return gc((c) => {
            const node = converter(data);
            if (!node) {
                return Result.err("can not convert");
            }
            const folder = new GroupNode(document, "undefined");
            this.addShapeNode(c, folder, node, node.getChildren(), getMaterialId);
            c(node);
            return Result.ok(folder);
        });
    };

    convertToSTEP(...shapes: IShape[]): Result<string> {
        let occShapes = shapes.map((shape) => {
            if (shape instanceof OccShape) {
                return shape.shape;
            }
            throw new Error("Shape is not an OccShape");
        });
        return Result.ok(wasm.Converter.convertToStep(occShapes));
    }

    convertFromSTEP(document: IDocument, step: Uint8Array): Result<FolderNode> {
        const result = this.converterFromData(document, step, wasm.Converter.convertFromStep);
        if (!result.isOk) {
            return Result.err(result.error);
        }

        // Get the main folder
        const mainFolder = result.value;

        // Collect all faces and add them directly to the main folder
        let faceCounter = 1;
        const collectFaces = (node: INode) => {
            if (node instanceof EditableShapeNode && node.shape instanceof OccShape) {
                // Get all sub-shapes (faces) from the geometry
                const subShapes = node.shape.iterShape();
                if (subShapes.length > 0) {
                    // Add each face as a separate node directly to the main folder
                    subShapes.forEach((subShape) => {
                        const faceName = `Face ${faceCounter}`;
                        const faceNode = new EditableShapeNode(
                            document,
                            faceName,
                            subShape,
                            node.materialId,
                        );
                        mainFolder.add(faceNode);
                        faceCounter++;
                    });
                }
            }

            // If it's a folder node, traverse its children
            if (node instanceof FolderNode) {
                let child = node.firstChild;
                while (child) {
                    collectFaces(child);
                    child = child.nextSibling;
                }
            }
        };
        collectFaces(mainFolder);

        return Result.ok(mainFolder);
    }

    // New method to import STEP file and return a list of faces
    convertFromSTEPToListFaces(document: IDocument, step: Uint8Array): Result<IShape[]> {
        const result = this.convertFromSTEP(document, step);
        if (!result.isOk) {
            return Result.err(result.error);
        }
        const folder = result.value;
        const faces: IShape[] = [];
        // Recursively collect all EditableShapeNode instances from the folder
        const collectFaces = (node: any) => {
            if (node instanceof EditableShapeNode && node.shape instanceof OccShape) {
                faces.push(node.shape);
            }
            if (node.children) {
                node.children.forEach(collectFaces);
            }
        };
        collectFaces(folder);
        return Result.ok(faces);
    }

    convertToBrep(shape: IShape): Result<string> {
        if (shape instanceof OccShape) {
            return Result.ok(wasm.Converter.convertToBrep(shape.shape));
        }
        return Result.err("Shape is not an OccShape");
    }

    convertFromBrep(brep: string): Result<IShape> {
        let shape = wasm.Converter.convertFromBrep(brep);
        return Result.ok(OcctHelper.wrapShape(shape));
    }
}
