// SPDX-FileCopyrightText: 2024-2026 Temps Contributors
// SPDX-License-Identifier: MIT OR Apache-2.0
import { expect, test } from "bun:test";
import { paginate } from "./pagination";
test("pagination bounds pages and handles shrinking and empty collections", () => {
 const data = Array.from({length: 19}, (_, i) => i);
 expect(paginate(data, 2, 8)).toEqual({page:2,totalPages:3,items:[8,9,10,11,12,13,14,15]});
 expect(paginate(data.slice(0, 3), 3, 8)).toEqual({page:1,totalPages:1,items:[0,1,2]});
 expect(paginate([], 3, 8)).toEqual({page:1,totalPages:1,items:[]});
 expect(paginate(data, -1, 8).page).toBe(1);
 expect(paginate(data, NaN, 8).page).toBe(1);
});
