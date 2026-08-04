---
title: Alpha
kg:
  prefLabel: Alpha
  broader:
    - Beta
  related:
    - Gamma
  appliesTo:
    - SP-X100
  notApplicableTo:
    - SP-X100
---

# Alpha

Alpha declares Beta as broader, which closes a cycle with beta.md. It also declares
Gamma as related while gamma.md makes Gamma an ancestor, which SKOS S27 forbids. And
it claims both to apply and not to apply to SP-X100.
