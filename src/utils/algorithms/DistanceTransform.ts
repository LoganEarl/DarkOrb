//Credit to Carson Burke. https://github.com/CarsonBurke/Screeps-Tutorials/blob/Master/basePlanningAlgorithms/distanceTransform.js

const roomDimensions = 50;

export function distanceTransformDiag(
    initialCM: CostMatrix,
    enableVisuals: boolean,
    room: Room,
    x1 = 0,
    y1 = 0,
    x2 = roomDimensions - 1,
    y2 = roomDimensions - 1
) {
    const distanceCM = new PathFinder.CostMatrix();

    let x;
    let y;

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
        }
    }

    let top;
    let left;

    // Loop through the xs and ys inside the bounds

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            top = distanceCM.get(x, y - 1);
            left = distanceCM.get(x - 1, y);

            distanceCM.set(x, y, Math.min(Math.min(top, left) + 1, distanceCM.get(x, y)));
        }
    }

    let bottom;
    let right;

    // Loop through the xs and ys inside the bounds

    for (x = x2; x >= x1; x -= 1) {
        for (y = y2; y >= y1; y -= 1) {
            bottom = distanceCM.get(x, y + 1);
            right = distanceCM.get(x + 1, y);

            distanceCM.set(x, y, Math.min(Math.min(bottom, right) + 1, distanceCM.get(x, y)));
        }
    }

    if (enableVisuals) {
        // Loop through the xs and ys inside the bounds

        for (x = x1; x <= x2; x += 1) {
            for (y = y1; y <= y2; y += 1) {
                room.visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: `hsl(${200}${distanceCM.get(x, y) * 10}, 100%, 60%)`,
                    opacity: 0.4
                });
            }
        }
    }

    return distanceCM;
}
