# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A MongoDB/Mongoose store adapter for the `sistemium-data` framework. Implements the `IStoreAdapter` interface to provide MongoDB persistence with CRUD, merge (bulk upsert), aggregation, transactions, and cursor-based pagination.

## Commands

```bash
npm test              # Run tests: ts-mocha test/test*.ts --exit
npm run coverage      # Run tests with nyc coverage
npm run watch         # TypeScript watch mode (tsc-watch)
npx tsc               # Build: compiles src/ → lib/
```

Tests use `mongodb-memory-server` with a 2-node replica set (for transaction support). No external MongoDB needed.

## Architecture

```
sistemium-data Model → MongoStoreAdapter (IStoreAdapter) → Mongoose → MongoDB
```

**Three source files in `src/`:**
- `MongoStoreAdapter.ts` — Core adapter implementing all 7 operations (find one/many, aggregate, create, update, merge, delete). This is the main entry point (`package.json` main: `lib/MongoStoreAdapter`).
- `MongoModel.ts` — Convenience class extending `Model` from sistemium-data, pre-wired for Mongoose.
- `DateOffsetAdapter.ts` — Alternative adapter using Date-based offsets instead of Mongo Timestamps for pagination.

**Key patterns:**
- Auto-indexes: `ts` (descending) on all collections, plus any field ending with `Id`
- Auto-timestamps: `cts` on create, `ts` on every write (Mongo Timestamp type by default, Date in DateOffsetAdapter)
- Offset pagination via `ts` field — clients pass `x-offset` header to resume
- `omitInternal()` strips `_`-prefixed fields and internal timestamps from responses
- Array updates use exported option constants: `ARRAY_PUSH_OPTION`, `ARRAY_PULL_OPTION`, `ARRAY_FILTERS_OPTION`
- Transactions via `startSession()`/`startTransaction()`/`commitTransaction()`/`abortTransaction()`, session passed as `MONGO_SESSION_OPTION` header

## Code Style

- TypeScript strict mode, `noUnusedLocals` enforced
- Prettier: no semicolons, single quotes, trailing commas, 2-space indent
- No ESLint — type checking and Prettier only
- Published output is `lib/` (compiled JS + `.d.ts` declarations)
