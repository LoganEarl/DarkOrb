import {clamp, findPositionsInsideRect} from "utils/UtilityFunctions";
import {distanceTransformDiag} from "./DistanceTransform";

const edgeValue = 255;
const stdDevDivisor = 4; //Increase to slow down spread.

export class LagoonDetector {
    private matrixes: CostMatrix[] = [];
    private iteration = 0;
    private targetIteration: number;
    private roomName: string;

    constructor(room: Room, targetIteration: number) {
        this.targetIteration = targetIteration;
        this.roomName = room.name;

        this.matrixes = [new PathFinder.CostMatrix(), new PathFinder.CostMatrix()];
        room.find(FIND_EXIT).forEach(exitPos => {
            this.matrixes[0].set(exitPos.x, exitPos.y, edgeValue);
            this.matrixes[1].set(exitPos.x, exitPos.y, edgeValue);
        });
    }

    //Returns undefined if still WIP and then the Cost matrix when complete
    public advanceFlow(): CostMatrix | undefined {
        let terrain = Game.map.getRoomTerrain(this.roomName);

        let readMatrix = this.matrixes[this.iteration % 2];
        let writeMatrix = this.matrixes[(this.iteration + 1) % 2];

        if (this.iteration < this.targetIteration) {
            this.iteration++;
            for (let y = 1; y < 49; y++) {
                for (let x = 1; x < 49; x++) {
                    //Don't update walls. This way they will impede the flow from the exits and create our lagoons
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

                    const adjacentPositions = findPositionsInsideRect(x - 1, y - 1, x + 1, y + 1);

                    let adjacentSpaces: number[] = adjacentPositions.map(pos => {
                        return readMatrix.get(pos.x, pos.y);
                    });

                    //average with surroundings empty space
                    //multiply by .9 for each bordering wall
                    let average = _.sum(adjacentSpaces) / adjacentSpaces.length;
                    let stdDev = Math.sqrt(
                        _.sum(adjacentSpaces, n => Math.pow(n - average, 2)) / adjacentSpaces.length
                    );
                    let newValue = average + stdDev / stdDevDivisor;
                    newValue = clamp(Math.round(newValue), 0, 255);
                    writeMatrix.set(x, y, newValue);
                }
            }
        } else {
            return this.trimDistances(writeMatrix);
        }
        return undefined;
    }

    private trimDistances(lagoonMatrix: CostMatrix): CostMatrix {
        let resultingMatrix = new PathFinder.CostMatrix();
        let terrainMatrix: CostMatrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(this.roomName);
        for (let y = 0; y <= 49; y++) {
            for (let x = 0; x <= 49; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) terrainMatrix.set(x, y, 255);
            }
        }

        let dTransform = distanceTransformDiag(terrainMatrix);
        for (let y = 1; y < 49; y++) {
            for (let x = 1; x < 49; x++) {
                if (dTransform.get(x, y) <= 3) resultingMatrix.set(x, y, 255);
                else resultingMatrix.set(x, y, lagoonMatrix.get(x, y));
            }
        }
        return resultingMatrix;
    }

    public visualize(visual: RoomVisual) {
        let matrix = this.matrixes[(this.iteration + 1) % 2];
        if (this.iteration >= this.targetIteration) matrix = this.trimDistances(matrix);

        for (let y = 0; y <= 49; y++) {
            for (let x = 0; x <= 49; x++) {
                if (matrix.get(x, y) != 0) {
                    visual.rect(x - 0.5, y - 0.5, 1, 1, {
                        fill: "hsl(" + (matrix.get(x, y) / 255) * 320 + ", 100%, 60%)",
                        opacity: 0.4
                    });
                }
            }
        }
    }
}
