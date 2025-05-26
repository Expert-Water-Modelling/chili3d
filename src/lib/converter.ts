import { Shape } from "./types";

export class Converter {
    private static converter = {
        convertFromBrep(brep: string): Shape {
            return {} as Shape; // This will be replaced by the actual implementation
        },
        convertToBrep(shape: Shape): string {
            return ""; // This will be replaced by the actual implementation
        },
        deleteFace(shape: string, faceToDelete: string): string {
            return ""; // This will be replaced by the actual implementation
        },
    };

    static convertFromBrep(brep: string): Shape {
        return this.converter.convertFromBrep(brep);
    }

    static convertToBrep(shape: Shape): string {
        return this.converter.convertToBrep(shape);
    }

    static deleteFace(shape: Shape, faceToDelete: Shape): Shape {
        return this.convertFromBrep(
            this.converter.deleteFace(this.convertToBrep(shape), this.convertToBrep(faceToDelete)),
        );
    }
}
