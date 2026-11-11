# Claude Coding Constitution

## Core Philosophy

Build software with **radical simplicity**.

The goal is not to write more code, but to **remove everything that is unnecessary**.
Every feature, dependency, abstraction, and line of code must justify its existence.

If something can be simplified, it should be simplified.
If something can be removed without harming the product, remove it.

Minimalism is not about fewer features — it is about **clear focus and thoughtful design**.

---

# Principles

## 1. Simplicity First

Prefer the simplest solution that solves the problem well.

Avoid:

* unnecessary abstractions
* premature optimization
* complex patterns when a simple function works
* excessive configuration

Good software should feel **obvious and effortless**.

---

## 2. Less Code Is Better Code

Code volume is not a success metric.

Favor:

* small functions
* clear logic
* minimal dependencies
* straightforward architecture

Delete code whenever possible.

---

## 3. Clarity Over Cleverness

Write code that another developer can understand in seconds.

Avoid:

* clever tricks
* dense one-liners
* hidden logic
* confusing abstractions

Good code reads like a well-written explanation.

---

## 4. Minimal Dependencies

Dependencies add complexity and risk.

Before adding a dependency ask:

* Can this be implemented in a few lines?
* Is the dependency worth the maintenance cost?
* Does it introduce unnecessary complexity?

Prefer **native platform features** whenever possible.

---

## 5. Strong Defaults

Design systems that work well **without configuration**.

Configuration should be optional, not required.

The best interface is often **no interface**.

---

## 6. Focus on the Core Problem

Do not build speculative features.

Implement:

* what is required
* what is clearly valuable
* what directly solves the user’s problem

Avoid feature creep.

---

## 7. Elegant Structure

Organize code so the structure explains the system.

Prefer:

* shallow folder structures
* small modules
* clear naming
* logical grouping

A developer should understand the project layout within minutes.

---

## 8. Consistency

Consistency reduces cognitive load.

Follow the same:

* naming conventions
* patterns
* structure
* error handling

Do not introduce new patterns without strong reason.

---

## 9. Thoughtful Iteration

Start simple.

Then refine.

Improve clarity, remove friction, and polish the experience until the system feels **inevitable**.

---

## 10. Craftsmanship

Software is a craft.

Take pride in:

* readable code
* careful design
* thoughtful decisions
* removing unnecessary complexity

Great software feels **quiet, focused, and intentional**.

---

# Coding Guidelines for Claude

When writing or modifying code:

1. Choose the **simplest correct solution**.
2. Avoid adding dependencies unless clearly justified.
3. Prefer **clear, readable code** over compact clever code.
4. Reduce abstractions unless they clearly improve clarity.
5. Keep files and functions **small and focused**.
6. Remove unused or redundant logic.
7. Ensure naming clearly reflects purpose.
8. Avoid speculative features or unnecessary flexibility.
9. Keep architecture simple and maintainable.
10. When unsure, **simplify the design**.

---

# Final Rule

If a solution feels complicated, it is probably wrong.

Step back.
Re-think the problem.
Find the simpler path.

Everything is done inside the GSD workflow, so the codebase is always in a releasable state. This allows us to iterate quickly and maintain a high level of quality without the overhead of managing branches or complex merge processes. Even on a quick side idea, we work on it but integrate it into the workflow.