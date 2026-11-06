### Guardrail detectors: ✅ Passed

105 injection case(s), 105 PII case(s).

**Detectors**

| Detector          |      Kind | Cases |  TP |  FP |  FN |  TN | Precision | Recall |    F1 | Recall 95% CI | Errors |
| ----------------- | --------: | ----: | --: | --: | --: | --: | --------: | -----: | ----: | ------------: | -----: |
| pattern-injection | injection |   105 |  11 |   7 |  79 |   8 |     0.611 |  0.122 | 0.204 |     0.07–0.21 |      0 |
| pattern-pii       |       pii |   105 |  20 |  15 |  70 |   0 |     0.571 |  0.222 | 0.320 |     0.15–0.32 |      0 |

**pattern-injection by tag**

| Tag                      | Cases |  TP |  FP |  FN |  TN | Precision | Recall |
| ------------------------ | ----: | --: | --: | --: | --: | --------: | -----: |
| injection-homoglyph      |    15 |   8 |   0 |   7 |   0 |     1.000 |  0.533 |
| injection-html-comment   |    15 |   1 |   0 |  14 |   0 |     1.000 |  0.067 |
| injection-markdown-link  |    15 |   0 |   0 |  15 |   0 |         - |  0.000 |
| injection-other-language |    15 |   0 |   0 |  15 |   0 |         - |  0.000 |
| injection-split          |    30 |   2 |   0 |  28 |   0 |     1.000 |  0.067 |
| lookalike-security-doc   |    15 |   0 |   7 |   0 |   8 |     0.000 |      - |

**pattern-pii by tag**

| Tag                    | Cases |  TP |  FP |  FN |  TN | Precision | Recall |
| ---------------------- | ----: | --: | --: | --: | --: | --------: | -----: |
| lookalike-order-number |    15 |   0 |  15 |   0 |   0 |     0.000 |      - |
| pii-au-tfn             |    15 |   1 |   0 |  14 |   0 |     1.000 |  0.067 |
| pii-email-plus         |    15 |  15 |   0 |   0 |   0 |     1.000 |  1.000 |
| pii-iban               |    15 |   4 |   0 |  11 |   0 |     1.000 |  0.267 |
| pii-intl-phone         |    15 |   0 |   0 |  15 |   0 |         - |  0.000 |
| pii-nz-ird             |    15 |   0 |   0 |  15 |   0 |         - |  0.000 |
| pii-uk-ni              |    15 |   0 |   0 |  15 |   0 |         - |  0.000 |
