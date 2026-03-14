# Orbit Mutation Testing

## Why this exists

Mutation testing checks whether tests can catch deliberate code mutations (small logic changes).
It complements line coverage and helps find weak assertions.

## Commands

### Full package mutation pass

```bash
npm run test:mutation
```

### Full pass + HTML report

```bash
npm run test:mutation:html
```

Report output file:

- `go-mutesting-report.html`

## Faster targeted runs (recommended while iterating)

Run a focused function regex while writing tests:

```bash
go run github.com/avito-tech/go-mutesting/cmd/go-mutesting@latest --exec-timeout 20 --match "deleteContextAPI|itemsAPI|hideItemAPI|unhideAtAPI" .
```

## Interpreting results

- `PASS` mutation: survived (tests did not catch it) -> potential test gap.
- `FAIL` mutation: killed (tests caught it) -> good.
- Mutation score is `survived / total` in this tool; lower is better.

## Practical workflow

1. Run targeted mutation checks for the behavior you are actively changing tests for.
2. Add/strengthen tests for surviving mutations that represent real behavior gaps.
3. Run full mutation pass before release candidates.
