export interface Shape {
    id: string;
    shapeType: number;
    mesh: any;
    matrix: any;
    isClosed(): boolean;
    isNull(): boolean;
    isEqual(other: Shape): boolean;
    isSame(other: Shape): boolean;
    isPartner(other: Shape): boolean;
    orientation(): number;
    findAncestor(ancestorType: number, fromShape: Shape): Shape[];
    findSubShapes(subshapeType: number): Shape[];
    iterShape(): Shape[];
    section(shape: Shape | any): Shape;
    split(edges: any[]): Shape;
    reserve(): void;
    copy(): Shape;
}
