---
phase: 09-performance-audit
plan: "02"
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements:
  - PERF-02
must_haves:
  truths:
    - "React DevTools Profiler session recorded"
    - "ShoppingList render hotspots identified"
    - "ItemRow render behavior documented"
    - "Render audit findings documented"
  artifacts:
    - path: ".planning/phases/09-performance-audit/09-AUDIT-RENDER.md"
      provides: "React render audit findings"
      min_lines: 40
  key_links:
    - from: "ShoppingList.tsx"
      to: "ItemRow[]"
      via: "map() renders each item"
    - from: "ItemRow.tsx"
      to: "local state"
      via: "useEffect syncs props to local state"
---

<objective>
Use React DevTools Profiler to identify unnecessary re-renders in ShoppingList, ItemRow, and other key components. Document render hotspots and patterns that cause excessive renders.
</objective>

<execution_context>
@D:/Projects/claude/.claude/get-shit-done/workflows/execute-plan.md
@D:/Projects/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@D:/Projects/claude/.planning/phases/09-performance-audit/09-RESEARCH.md
@D:/Projects/claude/src/app/(app)/dashboard/_components/ShoppingList.tsx
@D:/Projects/claude/src/app/(app)/dashboard/_components/ItemRow.tsx

<!-- Key findings from RESEARCH.md -->
<!-- ShoppingList has 6 independent useState calls and 3 useEffect hooks for localStorage -->
<!-- ItemRow uses local state synced via useEffect on every prop change -->
<!-- ItemRow is NOT memoized despite being in a list -->
</context>

<tasks>

<task type="checkpoint:human-verify">
  <name>Task 1: Record React DevTools Profiler session</name>
  <what-built>Profiling the ShoppingList component with React DevTools Profiler browser extension</what-built>
  <how-to-verify>
    1. Install React DevTools browser extension if not already installed (Chrome/Firefox/Edge)
    2. Start dev server: `npm run dev`
    3. Open http://localhost:3000 in browser
    4. Open React DevTools > Profiler tab
    5. Click Record button (circle)
    6. Interact with the app:
       - Click on an item to edit it
       - Type in the quick-add bar
       - Toggle store filter
       - Check/uncheck items
       - Clear completed items
    7. Click Stop
    8. In the flame chart, identify components that render most frequently:
       - Look for ShoppingList re-rendering when ItemRow interactions happen
       - Look for ItemRow re-rendering when unrelated items change
    9. Enable "Highlight updates" in React DevTools general settings
    10. Interact again and note which components flash blue
    11. Take screenshots of:
       - Flame chart showing render counts
       - Highlighted updates showing unnecessary re-renders
    12. Save screenshots to: .planning/phases/09-performance-audit/profiler-screenshots/
  </how-to-verify>
  <resume-signal>Type "approved" when profiler session recorded and screenshots saved, or describe issues encountered</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Document render audit findings</name>
  <files>.planning/phases/09-performance-audit/09-AUDIT-RENDER.md</files>
  <read_first>
    - src/app/(app)/dashboard/_components/ShoppingList.tsx
    - src/app/(app)/dashboard/_components/ItemRow.tsx
  </read_first>
  <action>
    Create 09-AUDIT-RENDER.md documenting the React render audit findings.

    Based on the RESEARCH.md findings and source code review, document:

    1. **ShoppingList Analysis** (from source code):
       - Has 6 independent useState calls (items, categoryList, selectedStoreId, organizationMode, lastClearedItems, preferencesLoaded)
       - Has 3 separate useEffect hooks for localStorage
       - Any state change causes ShoppingList to re-render

    2. **ItemRow Analysis** (from source code):
       - Uses local state (name, quantity, note, categoryId, selectedStoreIds)
       - useEffect syncs local state with props on every prop change
       - NOT wrapped in React.memo despite being in a list
       - Passed callbacks from ShoppingList that may be new functions on every render

    3. **Render Hotspots Observed** (from profiler session):
       - Document which interactions caused ShoppingList to re-render
       - Document if ItemRow re-renders when siblings change
       - Document if checking/unchecking one item causes other items to re-render

    4. **Key Findings Summary**:
       - Top 3 render optimization opportunities
       - Specific line/component causing issues
       - Estimated render count reduction if optimized

    Follow this format exactly:
    ```markdown
    # React Render Audit (PERF-02)

    **Date:** YYYY-MM-DD
    **Profiler:** React DevTools Profiler browser extension

    ## ShoppingList Render Analysis

    ### State Management Pattern
    [Describe the 6 useState calls and their purpose]

    ### useEffect Hooks
    [List the 3 localStorage useEffect hooks and what each does]

    ### Observed Render Behavior
    [What triggered ShoppingList re-renders during profiling]

    ## ItemRow Render Analysis

    ### Local State Pattern
    [Describe the local state synced via useEffect]

    ### Missing Optimizations
    [React.memo not used, callback stability issues]

    ### Observed Render Behavior
    [Did ItemRow re-render unnecessarily?]

    ## Render Hotspots

    | Component | Render Count (typical session) | Primary Trigger | Unnecessary? |
    |-----------|-------------------------------|-----------------|--------------|
    | ShoppingList | ... | ... | ... |
    | ItemRow | ... | ... | ... |

    ## Key Optimization Opportunities

    ### High Priority
    1. [Specific fix recommendation with component/line reference]

    ### Medium Priority
    1. [Specific fix recommendation]

    ## Recommendations for Phase 10

    Top 3 render optimizations to implement based on findings.
    ```
  </action>
  <acceptance_criteria>
    - 09-AUDIT-RENDER.md exists in the phase directory
    - File contains "ShoppingList Render Analysis" section
    - File contains "ItemRow Render Analysis" section
    - File contains "Render Hotspots" table
    - File contains "Key Optimization Opportunities" section
    - File is at least 40 lines
  </acceptance_criteria>
  <verify>
    <automated>wc -l .planning/phases/09-performance-audit/09-AUDIT-RENDER.md && grep -c "ShoppingList\|ItemRow" .planning/phases/09-performance-audit/09-AUDIT-RENDER.md</automated>
  </verify>
  <done>React render audit findings documented in 09-AUDIT-RENDER.md</done>
</task>

</tasks>

<verification>
All acceptance criteria passed. Profiler session completed, screenshots saved, findings documented.
</verification>

<success_criteria>
React DevTools Profiler session recorded with screenshots saved, 09-AUDIT-RENDER.md created with ShoppingList and ItemRow analysis, render hotspots identified and documented.
</success_criteria>

<output>
After completion, create `.planning/phases/09-performance-audit/09-02-PERF-02-SUMMARY.md`
</output>
