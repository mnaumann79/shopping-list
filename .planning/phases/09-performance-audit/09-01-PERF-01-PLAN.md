---
phase: 09-performance-audit
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - next.config.ts
autonomous: true
requirements:
  - PERF-01
must_haves:
  truths:
    - "Bundle analyzer report generated and accessible"
    - "Largest dependencies identified and documented"
    - "Unused or duplicative code identified"
  artifacts:
    - path: "next.config.ts"
      provides: "Bundle analyzer configuration"
      min_lines: 8
    - path: ".next/analyze/client.html"
      provides: "Client bundle visual report"
    - path: ".next/analyze/server.html"
      provides: "Server bundle visual report"
    - path: ".planning/phases/09-performance-audit/09-AUDIT-BUNDLE.md"
      provides: "Bundle analysis findings"
      min_lines: 30
  key_links:
    - from: "next.config.ts"
      to: "@next/bundle-analyzer"
      via: "import and plugin setup"
---

<objective>
Run bundle size analysis using @next/bundle-analyzer to identify large dependencies and unused code. Generate visual HTML reports and document the top 5 largest modules.
</objective>

<execution_context>
@D:/Projects/claude/.claude/get-shit-done/workflows/execute-plan.md
@D:/Projects/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@D:/Projects/claude/next.config.ts
@D:/Projects/claude/package.json
@D:/Projects/claude/.planning/phases/09-performance-audit/09-RESEARCH.md

<!-- Key findings from RESEARCH.md -->
<!-- Bundle analyzer is bundled with Next.js 16 — no install needed -->
<!-- next.config.ts currently empty -->
<!-- Key audit targets: Google Fonts (Fraunces + Nunito), better-auth, drizzle-orm, shadcn components -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Configure bundle analyzer in next.config.ts</name>
  <files>next.config.ts</files>
  <read_first>
    - next.config.ts
  </read_first>
  <action>
    Add @next/bundle-analyzer configuration to next.config.ts. The plugin is bundled with Next.js 16 and requires no installation.

    Replace the empty nextConfig object with:
    ```typescript
    import type { NextConfig } from "next";

    const nextConfig: NextConfig = {
      bundleConfig: {
        showVerboseActivities: false,
      },
    };

    // Import bundle analyzer only when ANALYZE env var is set
    const withBundleAnalyzer = (await import("@next/bundle-analyzer")).default({
      enabled: process.env.ANALYZE === "true",
    });

    export default withBundleAnalyzer(nextConfig);
    ```
  </action>
  <acceptance_criteria>
    - grep "import.*@next/bundle-analyzer" next.config.ts returns 1 match
    - grep "enabled.*ANALYZE" next.config.ts returns 1 match
    - next.config.ts exports a wrapped config (withBundleAnalyzer wrapped around nextConfig)
  </acceptance_criteria>
  <verify>
    <automated>grep -c "@next/bundle-analyzer" next.config.ts</automated>
  </verify>
  <done>Bundle analyzer configured, ready to run on build</done>
</task>

<task type="auto">
  <name>Task 2: Run production build with bundle analysis</name>
  <files>.next/analyze/client.html, .next/analyze/server.html</files>
  <read_first>
    - next.config.ts
  </read_first>
  <action>
    Run the Next.js production build with bundle analysis enabled. This generates visual HTML reports in .next/analyze/.

    1. Run: `ANALYZE=true npm run build`
    2. Wait for build to complete
    3. Verify reports were generated:
       - `.next/analyze/client.html` should exist
       - `.next/analyze/server.html` should exist

    Note: Build may take 2-3 minutes. The ANALYZE flag triggers the bundle analyzer plugin which writes HTML reports during the build process.
  </action>
  <acceptance_criteria>
    - .next/analyze/client.html file exists after build
    - .next/analyze/server.html file exists after build
    - Both HTML files contain module size data (should be > 100KB)
  </acceptance_criteria>
  <verify>
    <automated>ls -la .next/analyze/ 2>/dev/null | grep -E "client|server" | wc -l</automated>
  </verify>
  <done>Bundle analyzer reports generated in .next/analyze/ directory</done>
</task>

<task type="auto">
  <name>Task 3: Document bundle analysis findings</name>
  <files>.planning/phases/09-performance-audit/09-AUDIT-BUNDLE.md</files>
  <read_first>
    - .next/analyze/client.html
    - .next/analyze/server.html
  </read_first>
  <action>
    Create 09-AUDIT-BUNDLE.md documenting the top 5 largest modules from the bundle analysis.

    Document the following for each of the top 5 largest client-side modules:
    1. Module name
    2. Size (KB)
    3. What it contains
    4. Whether it appears necessary or potentially removable

    Also document:
    - Total initial JS bundle size
    - Any obvious tree-shaking opportunities (modules imported but not fully used)
    - Google Fonts impact (Fraunces + Nunito)
    - anylight auth dependency size

    Follow this format exactly:
    ```markdown
    # Bundle Size Audit (PERF-01)

    **Date:** YYYY-MM-DD
    **Build:** Production with ANALYZE=true

    ## Top 5 Largest Client Modules

    | Rank | Module | Size | Contains | Assessment |
    |------|--------|------|----------|------------|
    | 1 | ... | ... | ... | ... |
    ...

    ## Total Bundle Sizes

    | Metric | Value |
    |--------|-------|
    | Initial JS (client) | X KB |
    | Initial CSS | X KB |
    | Total (server) | X KB |

    ## Opportunities for Optimization

    ### High Priority (Easy Wins)
    1. ...
    2. ...

    ### Medium Priority
    1. ...
    2. ...

    ## Recommendations for Phase 10

    Top 3 actions to take in Performance Optimizations phase based on bundle findings.
    ```
  </action>
  <acceptance_criteria>
    - 09-AUDIT-BUNDLE.md exists in the phase directory
    - File contains "Top 5 Largest Client Modules" table with 5 entries
    - File contains "Total Bundle Sizes" section
    - File contains "Opportunities for Optimization" section
    - File is at least 30 lines
  </acceptance_criteria>
  <verify>
    <automated>wc -l .planning/phases/09-performance-audit/09-AUDIT-BUNDLE.md && grep -c "Top 5" .planning/phases/09-performance-audit/09-AUDIT-BUNDLE.md</automated>
  </verify>
  <done>Bundle audit findings documented in 09-AUDIT-BUNDLE.md</done>
</task>

</tasks>

<verification>
All acceptance criteria passed. Bundle analyzer configured, reports generated, findings documented.
</verification>

<success_criteria>
Bundle analyzer HTML reports exist in .next/analyze/, 09-AUDIT-BUNDLE.md created with top 5 modules documented, total bundle sizes recorded, and optimization opportunities identified.
</success_criteria>

<output>
After completion, create `.planning/phases/09-performance-audit/09-01-PERF-01-SUMMARY.md`
</output>
