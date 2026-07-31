<p align="center">
  <a href="https://corbits.dev">
    <h3 align="center">Corbits Examples</h3>
  </a>
</p>

Enjoy our curated collection of examples and solutions. Use these patterns to build your own robust and scalable applications on Corbits.

## What is Corbits?

[Corbits](https://corbits.dev) is a platform for building and running production agents. These examples show the patterns we recommend for building on it.

## What is Interchange?

[Interchange](https://github.com/faremeter/interchange) is an open source framework for building durable, production-grade agents and agentic workflows. Most of the starters in this repo are built on its `@intx/*` packages.

## Examples

- [Starter](/starter) – Functional applications which can act as a starting point
- [Agents](/agents) – Agent and skill definitions you can drop into your own tooling

## Adding a new example

Each example lives in its own directory under `starter/` or `agents/` and must be
self-contained: a reader copies that one directory, runs `bun install`,
and it works. No imports from other examples, no shared helper package,
no submodule. Duplication between examples is expected and fine — it is
the price of a starter you can actually copy.

Every example should include:

- A `.gitignore`
- A `package.json` with the license set to `MIT`, depending on published
  packages from the registry
- A `README.md` with a short description and, if it requires environment variables, a `.env.example` file and instructions on how to set them up

## Read the Docs

- [Corbits Docs](https://docs.corbits.dev)

If you have any questions or suggestions about the docs, feel free to [open a discussion](https://github.com/corbitsdev/examples/discussions), or [submit a PR](https://github.com/corbitsdev/examples/pulls) with your suggestions!

## Provide Feedback

- [Start a Discussion](https://github.com/corbitsdev/examples/discussions) with a question, piece of feedback, or idea you want to share with the team.
- [Open an Issue](https://github.com/corbitsdev/examples/issues) if you believe you've encountered a bug that you want to flag for the team.
