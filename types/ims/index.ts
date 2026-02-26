/**
 * IMS (Inventory Management System) Types
 *
 * Central type definitions for the IMS module — inventory, stock, indents,
 * sales, financial transactions, and reporting.
 *
 * Table naming: all IMS tables are prefixed with `ims_` to avoid collisions
 * with existing MyJKKN tables (e.g., departments, notifications).
 */

// Re-export all sub-module types from a single barrel file
export * from './units';
export * from './categories';
export * from './items';
export * from './suppliers';
export * from './stock';
export * from './grn';
export * from './indents';
export * from './sales';
export * from './financial';
export * from './reports';
export * from './stores';
export * from './receipt';
export * from './shifts';
