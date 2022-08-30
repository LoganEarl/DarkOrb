/*
    Need to partition sources to each room. We will have to use scouting data heavily here
        Have each room get a list of nearby source ids, as well as the path length
        We will partition sources to rooms in order of decreasing profits
        Each room will only be allowed to maintain sources up to their spawn capacity.
            This means the spawn systems will need to be able to calcuate spawn cap
            We will also need our room mining systems to be able to evaluate contributed spawn cap
            We will also need a way to evaluate spawn cap using only the path length and estimated e/t
    We will eventually need to support reservers as well
        We won't always be able to spawn reservers though. E capacity and all that
        Reservers will be registered globally. The nearest room that can spawn one will do so. 
        Spawn system needs to partition global creeps to whichever has the most free spawn time
    We will also need some way of sharing road paths too. Something where we repath for the furthest sources first
        and then have a cost matrix that gets updated with the roads we already planned
    Ugh, haulers also exist. Luckily I can steal most of that from the last bot


*/
