/* Dashboard helpers shared by its sections. */
import { primaryTerritory } from "../../domain/records.js";

/** Territories that have stores, in number order. */
export const territoriesOf = (ctx) => [...new Set(ctx.stores.map(primaryTerritory))].filter((territory) => territory !== "—").sort((a, b) => (+a || 0) - (+b || 0));
