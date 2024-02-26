# Dark Orb

There is no brain, only Dark Orb

## Basic Usage

You will need:

-   [Node.JS](https://nodejs.org/en/download) (16.x)
-   A Package Manager ([Yarn](https://yarnpkg.com/en/docs/getting-started) or [npm](https://docs.npmjs.com/getting-started/installing-node))
-   Rollup CLI (Optional, install via `npm install -g rollup`)

Download the latest source [here](https://github.com/screepers/screeps-typescript-starter/archive/master.zip) and extract it to a folder.

Open the folder in your terminal and run your package manager to install the required packages and TypeScript declaration files:

```bash
# npm
npm install

# yarn
yarn
```

### Rollup and code upload

DarkOrb uses rollup to compile your typescript and upload it to a screeps server.

Move or copy `screeps.sample.json` to `screeps.json` and edit it, changing the credentials and optionally adding or removing some of the destinations.

Running `rollup -c` will compile your code and do a "dry run", preparing the code for upload but not actually pushing it. Running `rollup -c --environment DEST:main` will compile your code, and then upload it to a screeps server using the `main` config from `screeps.json`.

You can use `-cw` instead of `-c` to automatically re-run when your source code changes - for example, `rollup -cw --environment DEST:main` will automatically upload your code to the `main` configuration every time your code is changed.

Finally, there are also NPM scripts that serve as aliases for these commands in `package.json` for IDE integration. Running `npm run push-main` is equivalent to `rollup -c --environment DEST:main`, and `npm run watch-sim` is equivalent to `rollup -cw --dest sim`.

#### Important! To upload code to a private server, you must have [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth) installed and configured!

## Typings

The type definitions for Screeps come from [typed-screeps](https://github.com/screepers/typed-screeps). If you find a problem or have a suggestion, please open an issue there.

## Conventions

This bot is organized into systems. Anything within the `src/system/` directory is considered a system. Each package is composed of multiple files

-   `index.d.ts`: Place any publicly accessible data types, interfaces, and Memory additions here.
-   `[System name]Interface.ts`: The storage interface for the system. Any code that does not rely on internal components should go here. An example is the shard map in the scouting system. Since other modules need scouting info too, this must be part of the interface.
-   `[SystemName]Logic.ts`: For complicated calculations and creep logic.
-   `[Scoppe][System Name]System.ts`: Files deliniating systems by their scope. For instance, there is a Shard level spawning system and a room level one. The shard level one is responsible for multi-room creeps and coordinating spawning operations between multiple rooms. Room level ones are just that, room level

Another important note is naming convention. TypeScript has no package-private modifier, so all methods beginning with `_` are considered scoped only to the system. You should not access any properties beginning with an underscore while crossing from one system to another.
