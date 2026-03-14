# swiss-cycling-aber-easy

GitHub Pages: https://lkuebler.github.io/swiss-cycling-aber-easy/

## How route determination works

Routes are calculated with the Valhalla bicycle profile.

The planner combines:

- **Cycling Way Importance** (low/medium/high) as the base preference for dedicated cycling ways vs roads.
- Checked route types in the UI:
  - **National Cycling Routes**
  - **Mountain Bike Routes**
  - **Hiking Routes**
  - **Public Streets (for planning)**

When cycling route types are checked, the planner biases more strongly toward cycling-oriented ways.
When **Public Streets** is checked, regular roads are included as additional options; when unchecked, the
planner keeps road usage as low as possible.
