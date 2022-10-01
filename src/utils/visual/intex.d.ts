interface RoomVisual {
    structure(x: number, y: number, type: BuildableStructureConstant, opts: any): void;
    connectRoads(opts?: any): void;
    speech(text: string, x: number, y: number, opts: any): void;
    test(): void;
    animatedPosition(x: number, y: number, opts: any): void;
    resource(type: ResourceConstant, x: number, y: number, size: number): void;
}
