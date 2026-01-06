//Credit to Carson Burke. https://github.com/CarsonBurke/Screeps-Tutorials/blob/Master/basePlanningAlgorithms/floodFill.js

import {Traveler} from "utils/traveler/Traveler";
import {findPositionsInsideRect} from "utils/UtilityFunctions";

export function getFloodFillCoordsSorted(
    roomName: string,
    seeds: Coord[],

) {
    // Get the terrain
    const terrain = Game.map.getRoomTerrain(roomName);
    // Construct a cost matrix for visited tiles and add seeds to it
    const visitedCM = new PathFinder.CostMatrix();

    //We will always get a matrix here because we have room visibility
    const blockingStructureMatrix = Traveler.getStructureMatrix(roomName, true, false);


}

//Produces a matrix where each slot is the distance from the nearest seed. Spreads out from the seed positions, and does not modify positions not covered by the fill
export function floodFill(
    roomName: string,
    seeds: Coord[],
    visual: RoomVisual | undefined,
    floodCM: CostMatrix = new PathFinder.CostMatrix(),
    structuresBlock: boolean = true
): CostMatrix {
    // Get the terrain
    const terrain = Game.map.getRoomTerrain(roomName);
    // Construct a cost matrix for visited tiles and add seeds to it
    const visitedCM = new PathFinder.CostMatrix();

    //We will always get a matrix here because we have room visibility
    const blockingStructureMatrix = Traveler.getStructureMatrix(roomName, true, false);

    // Construct values for the flood
    let depth = 0;
    let thisGeneration = seeds;
    let nextGeneration = [];

    // Loop through positions of seeds
    for (const pos of seeds) {
        // Record the seedsPos as visited
        visitedCM.set(pos.x, pos.y, 1);
    }

    // So long as there are positions in this gen
    while (thisGeneration.length) {
        // Reset next gen
        nextGeneration = [];

        // Iterate through positions of this gen
        for (const pos of thisGeneration) {
            // If the depth isn't 0
            if (depth != 0) {
                // Iterate if the terrain is a wall
                if (
                    terrain.get(pos.x, pos.y) == TERRAIN_MASK_WALL ||
                    (structuresBlock && blockingStructureMatrix?.get(pos.x, pos.y) == 255)
                )
                    continue;
                // Otherwise so long as the pos isn't a wall record its depth in the flood cost matrix
                floodCM.set(pos.x, pos.y, depth);
                // If visuals are enabled, show the depth on the pos
                if (visual)
                    visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {
                        fill: "hsl(" + 200 + depth * 2 + ", 100%, 60%)",
                        opacity: 0.4
                    });
            }

            const adjacentPositions = findPositionsInsideRect(pos.x - 1, pos.y - 1, pos.x + 1, pos.y + 1);

            // Loop through adjacent positions
            for (const adjacentPos of adjacentPositions) {
                // Iterate if the adjacent pos has been visited or isn't a tile
                if (visitedCM.get(adjacentPos.x, adjacentPos.y) == 1) continue;

                // Otherwise record that it has been visited
                visitedCM.set(adjacentPos.x, adjacentPos.y, 1);

                // Add it to the next gen
                nextGeneration.push(adjacentPos);
            }
        }

        // Set this gen to next gen
        thisGeneration = nextGeneration;

        // Increment depth
        depth++;
    }

    return floodCM;
}
