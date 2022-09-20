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

    // Log.d(JSON.stringify(Array.from(groupsByRcl.entries())));

    return groupsByRcl;
}
