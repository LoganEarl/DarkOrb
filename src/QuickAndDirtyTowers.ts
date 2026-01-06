import { registerNode, getNode, unregisterNode } from "system/hauling/HaulerInterface";
import { packPos } from "utils/Packrat";
import { getMainStorage } from "system/storage/StorageInterface";
import { Traveler } from "utils/traveler/Traveler";

export const defend = () => {
    const roomsToDefend = _.uniq(_.map(Game.spawns, s => s.room.name));

    for (let roomName of roomsToDefend) {
        const room = Game.rooms[roomName];
        if (!room) continue;

        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        }).map(t => t as StructureTower);

        if (towers.length === 0) continue;

        const hostiles = room.find(FIND_HOSTILE_CREEPS);

        for (const tower of towers) {
            // Priority is high if there are enemies to fight or allies to heal
            const injuredAllies = room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });
            const priorityScalar = (hostiles.length > 0 || injuredAllies.length > 0) ? 25 : 1;

            const energySpend = (hostiles.length > 0 || injuredAllies.length > 0) ? 10 : 0;
            let nodeId = "tower:" + packPos(tower.pos);
            let existingNode = getNode(roomName, nodeId);

            if (tower.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                unregisterNode(tower.pos.roomName, "Towers", nodeId);
            } else if (existingNode) {
                existingNode.level = tower.store.getUsedCapacity(RESOURCE_ENERGY);
                existingNode.baseDrdt = energySpend;
                existingNode.priorityScalar = priorityScalar;
            } else {
                let storage = getMainStorage(roomName);
                if (storage) {
                    let pathInfo = Traveler.findTravelPath(storage, tower, {
                        plainCost: 2, range: 1, ignoreRoads: false, ignoreStructures: false
                    });
                    registerNode(tower.pos.roomName, "Towers", {
                        analyticsCategories: [],
                        baseDrdt: energySpend,
                        priorityScalar: priorityScalar,
                        lastKnownPosition: tower.pos,
                        level: tower.store.getUsedCapacity(RESOURCE_ENERGY),
                        maxLevel: tower.store.getCapacity(RESOURCE_ENERGY),
                        nodeId: nodeId,
                        resource: RESOURCE_ENERGY,
                        serviceRoute: { pathCost: pathInfo.cost, pathLength: pathInfo.path.length },
                        targetId: tower.id,
                        type: "Sink"
                    });
                }
            }
        }

        let actionTaken = false;

        if (hostiles.length > 0) {
            let bestTarget: Creep | null = null;
            for (let enemy of hostiles) {
                let totalPotentialDamage = 0;
                for (let tower of towers) {
                    if (tower.store[RESOURCE_ENERGY] < 10) continue;
                    let range = tower.pos.getRangeTo(enemy);
                    let damage = range <= 5 ? 600 : (range >= 20 ? 150 : 600 - (450 * (range - 5) / 15));
                    totalPotentialDamage += damage;
                }

                let enemyHealPower = enemy.getActiveBodyparts(HEAL) * 12;
                if (totalPotentialDamage > enemyHealPower) {
                    bestTarget = enemy;
                    break;
                }
            }

            if (bestTarget) {
                towers.forEach(t => t.attack(bestTarget!));
                actionTaken = true;
            }
        }

        if (!actionTaken) {
            const targetToHeal = room.find(FIND_MY_CREEPS, {
                filter: (c) => c.hits < c.hitsMax
            }).sort((a, b) => a.hits - b.hits)[0]; // Focus the most damaged first

            if (targetToHeal) {
                towers.forEach(t => {
                    if (t.store[RESOURCE_ENERGY] >= 10) t.heal(targetToHeal);
                });
                actionTaken = true;
            }
        }
    }
}
