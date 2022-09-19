import { Log } from "utils/logger/Logger";

export function parseStructures(structureJsons: string[]): StructureGroup[] {
    let rawGroups = structureJsons.map(json => JSON.parse(json) as StructureGroup);
    let groupsByRcl: StructureGroup[] = [];
    // Log.d(`Parsed raw groups: ${JSON.stringify(rawGroups)}`);
    let lastGroup: StructureGroup = {
        rcl: 0,
        buildings: {}
    };

    let groupIndex = 0;
    for (let rcl = 1; rcl <= 8; rcl++) {
        // Log.d(`Looping for rcl: ${rcl}`);
        if (groupIndex < rawGroups.length) {
            let group = rawGroups[groupIndex];
            //If we have reached the rcl where we should place the building
            if (rcl >= group.rcl) {
                // Log.d(`Used group ${groupIndex} for rcl ${rcl}`);
                groupsByRcl[rcl] = Object.assign({}, group);
                lastGroup = group;
                groupIndex++;
            }
            //The group starts at a higher rcl. don't increase the group index, but do increase the rcl
            else {
                // Log.d(`No plans registered for RCL: ${rcl}, going with last group`);
                groupsByRcl[rcl] = Object.assign({}, lastGroup);
            }
        } else {
            // Log.d(`No plans registered for RCL: ${rcl} because it is greater than the number of groups.`);
            groupsByRcl[rcl] = Object.assign({}, lastGroup);
        }

        groupsByRcl[rcl].rcl = rcl;
    }

    Log.d(JSON.stringify(Array.from(groupsByRcl.entries())));

    return groupsByRcl;
}

export function drawStructureGroup(visual: RoomVisual, group: StructureGroup) {
    Log.d(JSON.stringify(group));
    for (let building in group.buildings) {
        let coords = group.buildings[building]!.pos;
        coords.forEach(c => visual.structure(c.x, c.y, building as BuildableStructureConstant, {}));
    }
}

const colors = {
    gray: "#555555",
    light: "#AAAAAA",
    road: "#666",
    energy: "#FFE87B",
    power: "#F53547",
    dark: "#181818",
    outline: "#8FBB93",
    speechText: "#000000",
    speechBackground: "#2ccf3b"
};

function drawStructure(
    visual: RoomVisual,
    x: number,
    y: number,
    type: BuildableStructureConstant,
    opts: { opacity?: number }
) {
    opts = Object.assign(
        {
            opacity: 1
        },
        opts
    );
    switch (type) {
        case "extension":
            visual.circle(x, y, {
                radius: 0.5,
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity
            });
            visual.circle(x, y, {
                radius: 0.35,
                fill: colors.gray,
                opacity: opts.opacity
            });
            break;
        case "spawn":
            visual.circle(x, y, {
                radius: 0.7,
                fill: colors.dark,
                stroke: "#CCCCCC",
                strokeWidth: 0.1,
                opacity: opts.opacity
            });
            break;
        case "link": {
            let osize = 0.3;
            let isize = 0.2;
            let outer: [number, number][] = [
                [0.0, -0.5],
                [0.4, 0.0],
                [0.0, 0.5],
                [-0.4, 0.0]
            ];
            let inner: [number, number][] = [
                [0.0, -0.3],
                [0.25, 0.0],
                [0.0, 0.3],
                [-0.25, 0.0]
            ];
            outer = relPoly(x, y, outer);
            inner = relPoly(x, y, inner);
            outer.push(outer[0]);
            inner.push(inner[0]);
            visual.poly(outer, {
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity
            });
            visual.poly(inner, {
                fill: colors.gray,
                stroke: undefined,
                opacity: opts.opacity
            });
            break;
        }
        case "terminal": {
            let outer: [number, number][] = [
                [0.0, -0.8],
                [0.55, -0.55],
                [0.8, 0.0],
                [0.55, 0.55],
                [0.0, 0.8],
                [-0.55, 0.55],
                [-0.8, 0.0],
                [-0.55, -0.55]
            ];
            let inner: [number, number][] = [
                [0.0, -0.65],
                [0.45, -0.45],
                [0.65, 0.0],
                [0.45, 0.45],
                [0.0, 0.65],
                [-0.45, 0.45],
                [-0.65, 0.0],
                [-0.45, -0.45]
            ];
            outer = relPoly(x, y, outer);
            inner = relPoly(x, y, inner);
            outer.push(outer[0]);
            inner.push(inner[0]);
            visual.poly(outer, {
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity
            });
            visual.poly(inner, {
                fill: colors.light,
                stroke: undefined,
                opacity: opts.opacity
            });
            visual.rect(x - 0.45, y - 0.45, 0.9, 0.9, {
                fill: colors.gray,
                stroke: colors.dark,
                strokeWidth: 0.1,
                opacity: opts.opacity
            });
            break;
        }
        case "lab":
            visual.circle(x, y - 0.025, {
                radius: 0.55,
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity
            });
            visual.circle(x, y - 0.025, {
                radius: 0.4,
                fill: colors.gray,
                opacity: opts.opacity
            });
            visual.rect(x - 0.45, y + 0.3, 0.9, 0.25, {
                fill: colors.dark,
                stroke: undefined,
                opacity: opts.opacity
            });
            {
                let box: [number, number][] = [
                    [-0.45, 0.3],
                    [-0.45, 0.55],
                    [0.45, 0.55],
                    [0.45, 0.3]
                ];
                box = relPoly(x, y, box);
                visual.poly(box, {
                    stroke: colors.outline,
                    strokeWidth: 0.05,
                    opacity: opts.opacity
                });
            }
            break;
        case "tower":
            visual.circle(x, y, {
                radius: 0.6,
                // fill: colors.dark,
                fill: "transparent",
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity
            });
            visual.rect(x - 0.4, y - 0.3, 0.8, 0.6, {
                fill: colors.gray,
                opacity: opts.opacity
            });
            visual.rect(x - 0.2, y - 0.9, 0.4, 0.5, {
                fill: colors.light,
                stroke: colors.dark,
                strokeWidth: 0.07,
                opacity: opts.opacity
            });
            break;
        case "rampart":
            visual.circle(x, y, {
                radius: 0.65,
                fill: "#434C43",
                stroke: "#5D735F",
                strokeWidth: 0.1,
                opacity: 0.3
            });
            break;
        case "observer":
            visual.circle(x, y, {
                fill: colors.dark,
                radius: 0.45,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity
            });
            visual.circle(x + 0.225, y, {
                fill: colors.outline,
                radius: 0.2,
                opacity: opts.opacity
            });
            break;
        case "nuker":
            let outline: [number, number][] = [
                [0, -1],
                [-0.47, 0.2],
                [-0.5, 0.5],
                [0.5, 0.5],
                [0.47, 0.2],
                [0, -1]
            ];
            outline = relPoly(x, y, outline);
            visual.poly(outline, {
                stroke: colors.outline,
                strokeWidth: 0.05,
                fill: colors.dark,
                opacity: opts.opacity
            });
            let inline: [number, number][] = [
                [0, -0.8],
                [-0.4, 0.2],
                [0.4, 0.2],
                [0, -0.8]
            ];
            inline = relPoly(x, y, inline);
            visual.poly(inline, {
                stroke: colors.outline,
                strokeWidth: 0.01,
                fill: colors.gray,
                opacity: opts.opacity
            });
            break;
        case "storage":
            let outline1 = relPoly(x, y, [
                [-0.45, -0.55],
                [0, -0.65],
                [0.45, -0.55],
                [0.55, 0],
                [0.45, 0.55],
                [0, 0.65],
                [-0.45, 0.55],
                [-0.55, 0],
                [-0.45, -0.55]
            ]);
            visual.poly(outline1, {
                stroke: colors.outline,
                strokeWidth: 0.05,
                fill: colors.dark,
                opacity: opts.opacity
            });
            visual.rect(x - 0.35, y - 0.45, 0.7, 0.9, {
                fill: colors.energy,
                opacity: opts.opacity
            });
            break;
        case "container":
            visual.rect(x - 0.225, y - 0.3, 0.45, 0.6, {
                fill: colors.gray,
                opacity: opts.opacity,
                stroke: colors.dark,
                strokeWidth: 0.09
            });
            visual.rect(x - 0.17, y + 0.07, 0.34, 0.2, {
                fill: colors.energy,
                opacity: opts.opacity
            });
            break;

        case "powerSpawn":
            visual.circle(x, y, {
                radius: 0.65,
                fill: colors.dark,
                stroke: colors.power,
                strokeWidth: 0.1,
                opacity: opts.opacity
            });
            visual.circle(x, y, {
                radius: 0.4,
                fill: colors.energy,
                opacity: opts.opacity
            });
            break;
        default:
            visual.circle(x, y, {
                fill: colors.light,
                radius: 0.35,
                stroke: colors.dark,
                strokeWidth: 0.2,
                opacity: opts.opacity
            });
            break;
    }
}

function relPoly(x: number, y: number, poly: [number, number][]) {
    return poly.map(p => {
        p[0] += x;
        p[1] += y;
        return p;
    });
}
