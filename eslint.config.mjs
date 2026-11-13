import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * The household-scoped tables, derived from the Drizzle schema.
 *
 * A table is household-scoped when it carries a `household_id` column, and so
 * is the table that column's foreign key points at — the household table
 * itself. Both are read off the schema's own source, so a table a later
 * migration adds is protected the day its schema says it should be, and a
 * table that is never household-scoped is never protected.
 *
 * It is deliberately not a list of names written out here. A hardcoded list
 * misses whatever the next migration adds, and misses it silently.
 */
function readSchema() {
  const schemaDir = path.join(process.cwd(), "src", "db", "schema");
  const files = fs
    .readdirSync(schemaDir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

  /** The tables the schema declares, by the name they are exported under. */
  const tables = new Map();

  for (const file of files) {
    const source = ts.createSourceFile(
      path.join(schemaDir, file),
      fs.readFileSync(path.join(schemaDir, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        if (!initializer || !ts.isCallExpression(initializer)) continue;

        const call = initializer;
        // pgTable("name", { ... }) — and pgSchema("auth").table("name", { ... }).
        const isPgTable =
          ts.isIdentifier(call.expression) && call.expression.text === "pgTable";
        const isSchemaTable =
          ts.isPropertyAccessExpression(call.expression) &&
          call.expression.name.text === "table";
        if (!isPgTable && !isSchemaTable) continue;

        const sqlName = call.arguments[0];
        const columns = call.arguments[1];
        if (!sqlName || !columns || !ts.isStringLiteral(sqlName)) continue;

        tables.set(declaration.name.text, {
          sqlName: sqlName.text,
          hasHouseholdColumn: /["'`]household_id["'`]/.test(columns.getText()),
          // The table a `household_id` column's foreign key points at.
          references: [
            ...columns.getText().matchAll(/references\(\(\)\s*=>\s*([A-Za-z0-9_]+)\./g),
          ].map((match) => match[1]),
        });
      }
    }
  }

  const householdTables = new Set();
  for (const [name, table] of tables) {
    if (table.hasHouseholdColumn) householdTables.add(name);
  }
  // The household table itself is protected too: it is what the other
  // household-scoped tables point at.
  for (const table of tables.values()) {
    if (!table.hasHouseholdColumn) continue;
    for (const referenced of table.references) {
      if (tables.has(referenced)) householdTables.add(referenced);
    }
  }

  return {
    exports: householdTables,
    sqlNames: new Set(
      [...householdTables].map((name) => tables.get(name)?.sqlName).filter(Boolean),
    ),
  };
}

const { exports: HOUSEHOLD_TABLES, sqlNames: HOUSEHOLD_SQL_NAMES } = readSchema();

/** The modules the scope helper lives in. They are the sanctioned path. */
const SCOPE_HELPER = ["src/db/scope.ts"];

const HOUSEHOLD_ACCESS_MESSAGE =
  "{{table}} is household-scoped. Read it through the scope helper, so the household is part of the query rather than a predicate every call site has to remember.";

/**
 * Forbids reading or writing a household-scoped table directly.
 *
 * All five access paths are covered: `db.select()`, `db.insert()`,
 * `db.update()`, `db.delete()` and `db.execute()`. A rule that covered only
 * the reads would leave the writes unguarded, and a route that takes an item
 * id could change another household's row without a household predicate.
 *
 * The scope helper is exempt because it is the one path that is supposed to
 * touch these tables — and it touches them through the transaction's client,
 * not through `db`.
 */
const noDirectHouseholdAccess = {
  create(context) {
    const filePath = context.filename ?? context.getFilename();
    if (SCOPE_HELPER.some((exempt) => filePath.endsWith(exempt))) return {};

    /** The local names that stand for a table from the schema. */
    const schemaImports = new Map();
    /** The local names that stand for the application database client. */
    const dbNames = new Set();

    function importedTableName(node) {
      if (!node || node.type !== "Identifier") return null;
      return schemaImports.get(node.name) ?? null;
    }

    function isDb(node) {
      return node && node.type === "Identifier" && dbNames.has(node.name);
    }

    function report(node, table) {
      context.report({ node, message: HOUSEHOLD_ACCESS_MESSAGE, data: { table } });
    }

    /** The static text of an argument, when it has any. */
    function staticText(node) {
      if (!node) return "";
      if (node.type === "Literal" && typeof node.value === "string") return node.value;
      if (node.type === "TaggedTemplateExpression") {
        return node.quasi.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ");
      }
      return "";
    }

    return {
      ImportDeclaration(node) {
        const modulePath = node.source.value;
        if (modulePath === "@/db") {
          for (const specifier of node.specifiers) {
            if (specifier.type === "ImportSpecifier" && specifier.imported.name === "db") {
              dbNames.add(specifier.local.name);
            }
          }
        }
        if (modulePath === "@/db/schema" || modulePath.startsWith("@/db/schema/")) {
          for (const specifier of node.specifiers) {
            if (specifier.type === "ImportSpecifier") {
              schemaImports.set(specifier.local.name, specifier.imported.name);
            }
          }
        }
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return;
        if (!dbNames.has(callee.object.name)) return;

        const method = callee.property.name;

        // db.insert(table) / db.update(table) / db.delete(table)
        if (method === "insert" || method === "update" || method === "delete") {
          const table = importedTableName(node.arguments[0]);
          if (table && HOUSEHOLD_TABLES.has(table)) report(node, table);
          return;
        }

        // db.execute(sql) — the table is named in the statement.
        if (method === "execute") {
          const sql = staticText(node.arguments[0]);
          if (!sql) return;
          for (const name of HOUSEHOLD_SQL_NAMES) {
            if (new RegExp(`\\b${name}\\b`, "i").test(sql)) {
              report(node, name);
              return;
            }
          }
          return;
        }

        // db.select().from(table)
        if (method === "from") {
          const selectCall = callee.object;
          if (
            selectCall.type !== "CallExpression" ||
            selectCall.callee.type !== "MemberExpression" ||
            selectCall.callee.property.name !== "select" ||
            !isDb(selectCall.callee.object)
          ) {
            return;
          }
          const table = importedTableName(node.arguments[0]);
          if (table && HOUSEHOLD_TABLES.has(table)) report(node, table);
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    ".codex/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      household: { rules: { "no-direct-access": noDirectHouseholdAccess } },
    },
    rules: {
      "household/no-direct-access": "error",
    },
  },
]);

export default eslintConfig;
