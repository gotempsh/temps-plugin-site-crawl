// SPDX-FileCopyrightText: 2024-2026 Temps Contributors
// SPDX-License-Identifier: MIT OR Apache-2.0
export function paginate<T>(items: T[], requested: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  return { page, totalPages, items: items.slice((page - 1) * size, page * size) };
}
