# Skills

Third-party Claude Code skills, vendored into the repo rather than installed into a
home directory. Sessions for this project run in throwaway containers, so anything
installed outside the repo is gone by the next one — committing them is what makes
them actually available.

All of these are design skills. They are here to raise the bar on how Quick Açaí
looks and feels, not to change what it does.

| Skill | From | License |
|---|---|---|
| `animation-vocabulary` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `apple-design` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `emil-design-eng` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `find-animation-opportunities` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `improve-animations` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `pick-ui-library` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `prototype` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `review-animations` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | MIT |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | see skill's LICENSE.txt |
| `app-store-screenshots` | [ParthJadhav/app-store-screenshots](https://github.com/ParthJadhav/app-store-screenshots) | MIT |

Upstream copies are not tracked here — to update one, re-clone its repo and copy the
skill directory over.

## What is not here, and why

Two of the five links these came from do not resolve, and one was too large to take
whole:

- **Brand Worldbuilding** (`nextlevelbuilder/brand-worldbuilding-skill`) — the
  repository does not exist.
- **Anthropic's Design Taste** (`openclaw/skills`) — the repository does not exist
  either. `frontend-design` above is Anthropic's own skill covering the same
  ground, taken from the official repo instead.
- **GStack** (`garrytan/gstack`) — real, but it is a 70 MB suite of 59 skills built
  around its own CLI, migration scripts and browser tooling, aimed mostly at iOS
  work. Its `design-review` skill cannot be lifted out on its own: it shells out to
  a dozen `gstack-*` binaries that come with the full install. If it is wanted, it
  should be installed the way its own README says, not vendored piecemeal.

## Before adding more

These were sourced from a social media post, which is not a distribution channel
with any guarantees. Everything above was cloned, read, and scanned for prompt
injection and credential access before being committed. A skill is instructions
that steer an agent working in this repository — worth the same scrutiny as a
dependency.
